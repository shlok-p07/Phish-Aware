"""Coverage for the artifact loader and the model adapter.

The production artifact is not in the repository, so every test that loads it is
opt-in and skips (tests/integration). That left the loader itself with no
coverage at all: checksum verification, the version check, the feature-name
mapping the Colab pipeline expects, and score normalisation only ever ran in
production.

These build a tiny fitted pipeline with the same feature schema, so the logic
around the model is exercised for real. They deliberately do not claim to test
the production model's behaviour -- only that a well-formed artifact is accepted,
a malformed one is refused, and the request is translated correctly.
"""

import hashlib
import json

import joblib
import pytest
import sklearn
from sklearn.dummy import DummyRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer

from app.core.config import get_settings
from app.models.awareness_predictor import (
    SERVICE_FEATURES,
    AwarenessModelUnavailable,
    JoblibAwarenessPredictor,
)
from app.models.schemas import AwarenessPredictionRequest


# The shared constant, not a second copy: a copy would let the two drift and
# then agree with each other while disagreeing with the service.
EXPECTED_COLUMNS = list(SERVICE_FEATURES)

# Captured by the fixture pipeline so a test can assert what the model was handed.
SEEN: dict[str, object] = {}


def _capture(frame):
    SEEN["frame"] = frame.copy()
    # The dummy downstream only needs a numeric column of the right length.
    return frame[["password_length"]]


def _fixture_pipeline(constant: float) -> Pipeline:
    pipeline = Pipeline(
        [
            ("capture", FunctionTransformer(_capture)),
            ("model", DummyRegressor(strategy="constant", constant=constant)),
        ]
    )
    # DummyRegressor ignores X, but the pipeline still has to be fitted.
    import pandas as pd

    frame = pd.DataFrame([{c: 1 for c in EXPECTED_COLUMNS}])
    pipeline.fit(frame, [constant])
    return pipeline


def _write_artifact(
    tmp_path, monkeypatch, *, constant=72.0, version=None, break_hash=False, metadata_extra=None
):
    settings = get_settings()
    version = settings.awareness_model_version if version is None else version

    model_path = tmp_path / settings.awareness_model_filename
    joblib.dump(_fixture_pipeline(constant), model_path)
    digest = hashlib.sha256(model_path.read_bytes()).hexdigest()
    if break_hash:
        digest = "0" * 64

    (tmp_path / settings.awareness_metadata_filename).write_text(
        json.dumps(
            {
                "artifact_sha256": digest,
                "model_version": version,
                "input_features": list(SERVICE_FEATURES),
                "raw_output_min": 0,
                "raw_output_max": 100,
                "sklearn_version": sklearn.__version__,
                **(metadata_extra or {}),
            }
        )
    )
    monkeypatch.setattr(settings, "model_store_dir", tmp_path)
    return model_path


def _request(**overrides) -> AwarenessPredictionRequest:
    payload = {
        "emails_per_day": 50,
        "suspicious_emails_per_day": 2,
        "password_length": 16,
        "reuses_passwords": 0,
        "uses_password_manager": 1,
        "mfa_familiar": 1,
        "mfa_enabled": 1,
        "security_training": 1,
        "clicks_links": 30,
        "opens_attachments": 20,
        "verifies_links": 80,
        "reports_suspicious": 70,
        "has_antivirus": 1,
        "uses_vpn": 1,
        "department": "Finance",
        "work_mode": "Hybrid",
        "diagnostic_accuracy": 0.6,
    }
    payload.update(overrides)
    return AwarenessPredictionRequest(**payload)


def test_loads_a_wellformed_artifact(tmp_path, monkeypatch):
    _write_artifact(tmp_path, monkeypatch)

    predictor = JoblibAwarenessPredictor()

    assert predictor.model_version == get_settings().awareness_model_version


def test_refuses_an_artifact_whose_checksum_does_not_match(tmp_path, monkeypatch):
    # The checksum is the only thing standing between the service and a swapped
    # artifact, and nothing exercised it.
    _write_artifact(tmp_path, monkeypatch, break_hash=True)

    with pytest.raises(AwarenessModelUnavailable, match="checksum"):
        JoblibAwarenessPredictor()


def test_refuses_an_artifact_whose_version_does_not_match(tmp_path, monkeypatch):
    _write_artifact(tmp_path, monkeypatch, version="awareness-v0.0.1-not-ours")

    with pytest.raises(AwarenessModelUnavailable, match="version"):
        JoblibAwarenessPredictor()


def test_refuses_missing_metadata(tmp_path, monkeypatch):
    settings = get_settings()
    joblib.dump(_fixture_pipeline(50.0), tmp_path / settings.awareness_model_filename)
    monkeypatch.setattr(settings, "model_store_dir", tmp_path)

    with pytest.raises(AwarenessModelUnavailable, match="metadata"):
        JoblibAwarenessPredictor()


def test_refuses_unparseable_metadata(tmp_path, monkeypatch):
    settings = get_settings()
    joblib.dump(_fixture_pipeline(50.0), tmp_path / settings.awareness_model_filename)
    (tmp_path / settings.awareness_metadata_filename).write_text("{ not json")
    monkeypatch.setattr(settings, "model_store_dir", tmp_path)

    with pytest.raises(AwarenessModelUnavailable, match="metadata"):
        JoblibAwarenessPredictor()


def test_refuses_a_missing_artifact(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "model_store_dir", tmp_path)

    with pytest.raises(AwarenessModelUnavailable, match="not found"):
        JoblibAwarenessPredictor()


def test_hands_the_model_every_column_the_training_pipeline_expects(tmp_path, monkeypatch):
    _write_artifact(tmp_path, monkeypatch)
    SEEN.clear()

    JoblibAwarenessPredictor().predict(_request())

    frame = SEEN["frame"]
    assert list(frame.columns) == EXPECTED_COLUMNS


def test_translates_booleans_to_the_yes_no_the_model_was_trained_on(tmp_path, monkeypatch):
    _write_artifact(tmp_path, monkeypatch)
    SEEN.clear()

    JoblibAwarenessPredictor().predict(_request(reuses_passwords=0, uses_password_manager=1))

    row = SEEN["frame"].iloc[0]
    assert row["password_reuse"] == "No"
    assert row["password_manager_usage"] == "Yes"


def test_sends_the_quiz_score_as_a_percentage(tmp_path, monkeypatch):
    # The app stores 0-1; the fitted model was trained on 0-100. Getting this
    # wrong would quietly shift every prediction.
    _write_artifact(tmp_path, monkeypatch)
    SEEN.clear()

    JoblibAwarenessPredictor().predict(_request(diagnostic_accuracy=0.6))

    assert SEEN["frame"].iloc[0]["security_quiz_score"] == pytest.approx(60.0)


def test_normalizes_the_prediction_to_zero_one(tmp_path, monkeypatch):
    _write_artifact(tmp_path, monkeypatch, constant=72.0)

    result = JoblibAwarenessPredictor().predict(_request())

    assert result.awareness_score == pytest.approx(0.72)


@pytest.mark.parametrize("constant", [-40.0, 180.0])
def test_refuses_a_prediction_outside_the_expected_range(tmp_path, monkeypatch, constant):
    # A regressor can return anything. The service refuses the value rather than
    # clamping it, which is the right call: a clamped 1.0 is indistinguishable
    # from a confident, correct 1.0, and the caller already falls back to
    # diagnostic accuracy when prediction is unavailable.
    _write_artifact(tmp_path, monkeypatch, constant=constant)

    with pytest.raises(ValueError, match="invalid 0-100 score"):
        JoblibAwarenessPredictor().predict(_request())


def test_refuses_an_artifact_trained_on_different_features(tmp_path, monkeypatch):
    # The pipeline would happily predict from the wrong columns -- it would just
    # predict from the wrong numbers. This is the check that turns confident
    # nonsense into a refusal.
    reordered = list(SERVICE_FEATURES)
    reordered[0], reordered[1] = reordered[1], reordered[0]
    _write_artifact(tmp_path, monkeypatch, metadata_extra={"input_features": reordered})

    with pytest.raises(AwarenessModelUnavailable, match="feature contract"):
        JoblibAwarenessPredictor()


def test_refuses_an_artifact_missing_a_feature(tmp_path, monkeypatch):
    _write_artifact(
        tmp_path, monkeypatch, metadata_extra={"input_features": list(SERVICE_FEATURES)[:-1]}
    )

    with pytest.raises(AwarenessModelUnavailable, match="feature contract"):
        JoblibAwarenessPredictor()


@pytest.mark.parametrize(
    "extra",
    [{"raw_output_max": 1}, {"raw_output_min": -100}, {"raw_output_max": 10}],
)
def test_refuses_an_artifact_on_a_different_scale(tmp_path, monkeypatch, extra):
    # predict() divides by 100. An artifact on any other scale would produce a
    # wrong normalized score rather than an error.
    _write_artifact(tmp_path, monkeypatch, metadata_extra=extra)

    with pytest.raises(AwarenessModelUnavailable, match="output scale"):
        JoblibAwarenessPredictor()


def test_refuses_an_artifact_built_with_another_sklearn(tmp_path, monkeypatch):
    # A pickle is only portable across the version that wrote it. sklearn warns
    # and keeps going, which is the silent-wrongness case worth refusing.
    _write_artifact(tmp_path, monkeypatch, metadata_extra={"sklearn_version": "0.24.2"})

    with pytest.raises(AwarenessModelUnavailable, match="scikit-learn"):
        JoblibAwarenessPredictor()


def test_accepts_a_patch_level_sklearn_difference(tmp_path, monkeypatch):
    major, minor, *_ = sklearn.__version__.split(".")
    _write_artifact(
        tmp_path, monkeypatch, metadata_extra={"sklearn_version": f"{major}.{minor}.99"}
    )

    # Patch releases do not change the pickle format, and refusing them would
    # make a routine dependency bump look like a corrupt model.
    assert JoblibAwarenessPredictor().model_version == get_settings().awareness_model_version


def test_tolerates_metadata_with_no_recorded_sklearn_version(tmp_path, monkeypatch):
    # Artifacts published before the field existed are still loadable; the check
    # is only enforced when there is something to check against.
    _write_artifact(tmp_path, monkeypatch, metadata_extra={"sklearn_version": None})

    assert JoblibAwarenessPredictor().model_version == get_settings().awareness_model_version


@pytest.mark.parametrize(
    "missing",
    ["model_version", "artifact_sha256", "input_features", "raw_output_min", "raw_output_max"],
)
def test_names_the_metadata_field_that_is_missing(tmp_path, monkeypatch, missing):
    import json

    settings = get_settings()
    _write_artifact(tmp_path, monkeypatch)
    path = tmp_path / settings.awareness_metadata_filename
    metadata = json.loads(path.read_text())
    del metadata[missing]
    path.write_text(json.dumps(metadata))

    # Naming the field beats "version mismatch against None", which is what an
    # operator used to get for a metadata file that was missing everything.
    with pytest.raises(AwarenessModelUnavailable, match=missing):
        JoblibAwarenessPredictor()


def test_rejects_a_stale_version_before_reading_the_artifact(tmp_path, monkeypatch):
    _write_artifact(tmp_path, monkeypatch, version="awareness-v1.0.0")
    settings = get_settings()
    # Truncating the artifact makes any read of it fail. If the version check did
    # not come first, this would surface as a checksum or load error instead --
    # which on a large artifact is a slow, confusing failure rather than a fast
    # clear one.
    (tmp_path / settings.awareness_model_filename).write_bytes(b"")

    with pytest.raises(AwarenessModelUnavailable, match="version mismatch"):
        JoblibAwarenessPredictor()


def test_the_version_mismatch_message_says_what_to_do(tmp_path, monkeypatch):
    _write_artifact(tmp_path, monkeypatch, version="awareness-v1.0.0")

    with pytest.raises(AwarenessModelUnavailable) as raised:
        JoblibAwarenessPredictor()

    message = str(raised.value)
    assert "awareness-v1.0.0" in message
    assert get_settings().awareness_model_version in message
    assert "train_awareness" in message


def test_exposes_the_metrics_it_was_published_with(tmp_path, monkeypatch):
    _write_artifact(tmp_path, monkeypatch, metadata_extra={"metrics": {"r2": 0.94}})

    # So a deployment can report which model it is running and how good it was
    # measured to be, rather than only that something loaded.
    assert JoblibAwarenessPredictor().metrics == {"r2": 0.94}

