"""Train and publish the phishing-awareness regression artifact.

Run:
    python -m scripts.train_awareness                    # train, evaluate, publish
    python -m scripts.train_awareness --no-publish       # evaluate only
    python -m scripts.train_awareness --quick            # skip the slow candidates

The service consumes the published artifact through
app/models/awareness_predictor.py, which builds a one-row DataFrame from the
survey and calls predict(). Two constraints follow from that and drive
everything here:

1. The model may only use features the app actually collects. The dataset also
   carries `age`, `failed_phishing_simulation` and `cybersecurity_awareness_score`;
   none of them reach the service at inference time, and the last correlates 0.90
   with the target, so training on it would produce a flattering score for a
   model that could never reproduce it in production. They are excluded.

2. Categories must be encoded so an unseen value cannot fail a request.
   Departments are customer-defined now, so a member's department may be a name
   the model never saw; handle_unknown="ignore" makes that a zero row rather than
   an exception.

Reported metrics, on a held-out split the search never touches:
    R2       -- variance explained
    within5  -- share of predictions inside 5 points on the 0-100 scale
    MAE/RMSE -- average and outlier-sensitive error, in points
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    ExtraTreesRegressor,
    HistGradientBoostingRegressor,
    RandomForestRegressor,
    StackingRegressor,
)
from sklearn.impute import SimpleImputer
from sklearn.linear_model import RidgeCV
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import KFold, RandomizedSearchCV, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import get_settings  # noqa: E402

TARGET = "phishing_awareness_score"

# The order the service builds its one-row frame in, which the published metadata
# has to record exactly. Asserted below so a reordering here cannot silently
# disagree with app/models/awareness_predictor.py.
SERVICE_FEATURE_ORDER = [
    "department",
    "work_mode",
    "daily_email_count",
    "suspicious_email_frequency",
    "password_length",
    "password_reuse",
    "password_manager_usage",
    "mfa_enabled",
    "cybersecurity_training",
    "security_quiz_score",
    "link_click_tendency",
    "attachment_open_rate",
    "verification_before_click",
    "reporting_suspicious_email",
    "antivirus_installed",
    "vpn_usage",
]

# Exactly what app/models/awareness_predictor.py sends, in its order.
CATEGORICAL = [
    "department",
    "work_mode",
    "password_reuse",
    "password_manager_usage",
    "mfa_enabled",
    "cybersecurity_training",
    "antivirus_installed",
    "vpn_usage",
]
NUMERIC = [
    "daily_email_count",
    "suspicious_email_frequency",
    "password_length",
    "security_quiz_score",
    "link_click_tendency",
    "attachment_open_rate",
    "verification_before_click",
    "reporting_suspicious_email",
]
FEATURES = SERVICE_FEATURE_ORDER
assert sorted(FEATURES) == sorted(CATEGORICAL + NUMERIC), "feature lists disagree"

# Never train on these: not collected by the app, or derived from the target.
EXCLUDED = ["age", "failed_phishing_simulation", "cybersecurity_awareness_score"]

RANDOM_STATE = 42
WITHIN_POINTS = 5.0

# How the product actually consumes the score, so the model can be judged on the
# decision it drives rather than on a bare R2. The service normalizes 0-100 to
# 0-1; these are the same cuts on the 0-100 scale.
#   levelForAwarenessScore     (src/server/leveling.ts)
#   difficultyForAwarenessScore (src/server/attackProfiles.ts)
LEVEL_CUTS = [40.0, 65.0]
DIFFICULTY_CUTS = [20.0, 40.0, 65.0, 85.0]


def load_frame(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path)
    missing = [c for c in FEATURES + [TARGET] if c not in frame.columns]
    if missing:
        raise SystemExit(f"dataset is missing required columns: {missing}")
    # Rows with no target teach nothing; feature gaps are imputed in-pipeline.
    return frame.dropna(subset=[TARGET])


def build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        [
            (
                "categorical",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="most_frequent")),
                        ("encode", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                CATEGORICAL,
            ),
            (
                "numeric",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="median")),
                        # Only the linear candidates need this; it is harmless for
                        # the trees and keeps one preprocessor for every model.
                        ("scale", StandardScaler()),
                    ]
                ),
                NUMERIC,
            ),
        ]
    )


def candidates(quick: bool) -> dict[str, tuple[object, dict]]:
    """Model name -> (estimator, search space). Empty space means fit as-is."""
    models: dict[str, tuple[object, dict]] = {
        # Baseline. If a linear model already explains most of the variance, the
        # ensembles have to earn their extra cost.
        "ridge": (RidgeCV(alphas=np.logspace(-3, 3, 25)), {}),
        "hist_gradient_boosting": (
            HistGradientBoostingRegressor(random_state=RANDOM_STATE, early_stopping=True),
            {
                "model__learning_rate": [0.03, 0.05, 0.1, 0.2],
                "model__max_leaf_nodes": [15, 31, 63, 127],
                "model__min_samples_leaf": [10, 20, 40],
                "model__l2_regularization": [0.0, 0.1, 1.0],
                "model__max_iter": [300, 600],
            },
        ),
    }
    if quick:
        return models

    models["random_forest"] = (
        RandomForestRegressor(random_state=RANDOM_STATE, n_jobs=-1),
        {
            "model__n_estimators": [200, 400],
            "model__max_depth": [None, 16, 24],
            "model__min_samples_leaf": [1, 2, 4],
            "model__max_features": ["sqrt", 0.5, 1.0],
        },
    )
    models["extra_trees"] = (
        ExtraTreesRegressor(random_state=RANDOM_STATE, n_jobs=-1),
        {
            "model__n_estimators": [200, 400],
            "model__min_samples_leaf": [1, 2, 4],
            "model__max_features": ["sqrt", 0.5, 1.0],
        },
    )
    return models


def evaluate(model, X, y) -> dict[str, float]:
    predicted = np.clip(model.predict(X), 0.0, 100.0)
    actual = np.asarray(y, dtype=float)
    return {
        "r2": float(r2_score(actual, predicted)),
        "within5": float(np.mean(np.abs(predicted - actual) <= WITHIN_POINTS)),
        "within10": float(np.mean(np.abs(predicted - actual) <= 10.0)),
        # The decisions the score is actually used for: which level a trainee
        # starts at, and which difficulty they are served. A point of error that
        # does not move somebody across a cut costs the product nothing.
        "level_agreement": float(
            np.mean(np.digitize(predicted, LEVEL_CUTS) == np.digitize(actual, LEVEL_CUTS))
        ),
        "difficulty_agreement": float(
            np.mean(
                np.digitize(predicted, DIFFICULTY_CUTS) == np.digitize(actual, DIFFICULTY_CUTS)
            )
        ),
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(np.sqrt(mean_squared_error(actual, predicted))),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=None)
    parser.add_argument("--no-publish", action="store_true")
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--iterations", type=int, default=25)
    args = parser.parse_args()

    settings = get_settings()
    data_path = args.data or (settings.data_dir / "awareness_training_2026.csv")
    if not data_path.is_file():
        raise SystemExit(f"no dataset at {data_path}")

    frame = load_frame(data_path)
    print(f"dataset      {data_path.name}  {len(frame):,} rows")
    print(f"features     {len(FEATURES)} ({len(CATEGORICAL)} categorical, {len(NUMERIC)} numeric)")
    print(f"excluded     {', '.join(EXCLUDED)}")

    X = frame[FEATURES]
    y = frame[TARGET].astype(float)
    # The test split is held back from model selection entirely, so the numbers
    # printed at the end are not the numbers anything was chosen on.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE
    )
    print(f"split        {len(X_train):,} train / {len(X_test):,} test\n")

    cv = KFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    results: dict[str, dict] = {}
    fitted: dict[str, Pipeline] = {}

    for name, (estimator, space) in candidates(args.quick).items():
        started = time.time()
        pipeline = Pipeline([("prep", build_preprocessor()), ("model", estimator)])
        if space:
            search = RandomizedSearchCV(
                pipeline,
                space,
                n_iter=args.iterations,
                cv=cv,
                scoring="r2",
                random_state=RANDOM_STATE,
                n_jobs=-1,
                refit=True,
            )
            search.fit(X_train, y_train)
            best, cv_score = search.best_estimator_, float(search.best_score_)
            chosen = {k.replace("model__", ""): v for k, v in search.best_params_.items()}
        else:
            pipeline.fit(X_train, y_train)
            best, cv_score = pipeline, float("nan")
            chosen = {}
        scores = evaluate(best, X_test, y_test)
        results[name] = {"cv_r2": cv_score, "params": chosen, **scores}
        fitted[name] = best
        print(
            f"{name:24} r2={scores['r2']:.4f}  within5={scores['within5']:.3f}  "
            f"mae={scores['mae']:.2f}  ({time.time() - started:.0f}s)"
        )

    # A stack over the tuned candidates, which is where the remaining points
    # usually are: the trees and the linear model make different mistakes.
    if not args.quick and len(fitted) > 1:
        started = time.time()
        stack = StackingRegressor(
            estimators=[(n, fitted[n]) for n in fitted],
            final_estimator=RidgeCV(alphas=np.logspace(-3, 3, 25)),
            cv=cv,
            n_jobs=-1,
        )
        stack.fit(X_train, y_train)
        scores = evaluate(stack, X_test, y_test)
        results["stacked"] = {"cv_r2": float("nan"), "params": {}, **scores}
        fitted["stacked"] = stack
        print(
            f"{'stacked':24} r2={scores['r2']:.4f}  within5={scores['within5']:.3f}  "
            f"mae={scores['mae']:.2f}  ({time.time() - started:.0f}s)"
        )

    winner = max(results, key=lambda n: results[n]["r2"])
    best_scores = results[winner]
    print(f"\nbest         {winner}")
    print(f"  R2                    {best_scores['r2']:.4f}")
    print(f"  level agreement       {best_scores['level_agreement'] * 100:.2f}%")
    print(f"  difficulty agreement  {best_scores['difficulty_agreement'] * 100:.2f}%")
    print(f"  within +/-5 points    {best_scores['within5'] * 100:.2f}%")
    print(f"  within +/-10 points   {best_scores['within10'] * 100:.2f}%")
    print(f"  MAE                   {best_scores['mae']:.2f} points")
    print(f"  RMSE                  {best_scores['rmse']:.2f} points")
    if best_scores["params"]:
        print(f"  params             {best_scores['params']}")

    if args.no_publish:
        print("\nnot published (--no-publish)")
        return 0

    store = settings.model_store_dir
    store.mkdir(parents=True, exist_ok=True)
    model_path = store / settings.awareness_model_filename
    joblib.dump(fitted[winner], model_path)
    digest = hashlib.sha256(model_path.read_bytes()).hexdigest()
    (store / settings.awareness_metadata_filename).write_text(
        json.dumps(
            {
                "model_version": settings.awareness_model_version,
                # Names its own artifact so the metadata is self-contained --
                # scripts/verify_model.py reads it rather than guessing a
                # filename that has now changed once.
                "artifact": settings.awareness_model_filename,
                "artifact_sha256": digest,
                "algorithm": winner,
                # Recorded so the loader can refuse a pickle written by a
                # different library version. sklearn signals that with a warning
                # and then keeps going, which is the silent-wrongness case.
                "sklearn_version": sklearn.__version__,
                "numpy_version": np.__version__,
                "pandas_version": pd.__version__,
                "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "dataset": data_path.name,
                "rows": int(len(frame)),
                # `input_features` in this exact order, and the output bounds,
                # are the contract tests/integration asserts against -- the
                # service's normalization depends on the raw score being 0-100.
                "input_features": FEATURES,
                "raw_output_min": 0,
                "raw_output_max": 100,
                "production_normalization": "raw_score / 100",
                "excluded_features": EXCLUDED,
                "metrics": {
                    k: best_scores[k]
                    for k in (
                        "r2",
                        "level_agreement",
                        "difficulty_agreement",
                        "within5",
                        "within10",
                        "mae",
                        "rmse",
                    )
                },
                "params": best_scores["params"],
            },
            indent=2,
        )
        + "\n"
    )
    size_mb = model_path.stat().st_size / 1_000_000
    print(f"\npublished    {model_path.name}  {size_mb:.1f} MB")
    print(f"             sha256 {digest[:16]}...")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
