"""Production adapter for the exported phishing-awareness model artifact.

The artifact is a pickle produced elsewhere (scripts/train_awareness.py), so
everything it claims about itself is verified before a single prediction is
served. The failure mode this guards against is not a crash -- a crash is fine,
the caller falls back to diagnostic quiz accuracy -- but a model that loads
cleanly and returns confident nonsense because the columns, the version or the
scale moved underneath it.

Checks run cheapest-first, so a wrong version is rejected before a large artifact
is hashed or unpickled.
"""

from functools import lru_cache
import hashlib
import json
import warnings
from math import isfinite
from pathlib import Path
from typing import Any, Protocol

import joblib
import pandas as pd
import sklearn

from app.core.config import get_settings
from app.models.schemas import AwarenessPredictionRequest, AwarenessPredictionResult


class AwarenessModelUnavailable(RuntimeError):
    """Raised when the configured model artifact cannot be trusted or used."""


#: The columns the fitted pipeline was trained on, in order. This is the contract
#: between training and serving: if the artifact was trained on a different set,
#: the pipeline still predicts, it just predicts from the wrong numbers. Verified
#: against the artifact's own metadata at load time rather than assumed.
SERVICE_FEATURES: tuple[str, ...] = (
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
)

#: The raw scale the artifact must be on, because predict() divides by 100.
RAW_OUTPUT_MIN = 0
RAW_OUTPUT_MAX = 100

#: A request used once at load time to prove the pipeline actually predicts.
#: Mid-range on every axis, so any plausible model returns something in range.
_SMOKE_ROW: dict[str, Any] = {
    "department": "Finance",
    "work_mode": "Hybrid",
    "daily_email_count": 50,
    "suspicious_email_frequency": 2,
    "password_length": 14,
    "password_reuse": "No",
    "password_manager_usage": "Yes",
    "mfa_enabled": "Yes",
    "cybersecurity_training": "Yes",
    "security_quiz_score": 70.0,
    "link_click_tendency": 20.0,
    "attachment_open_rate": 20.0,
    "verification_before_click": 70.0,
    "reporting_suspicious_email": 70.0,
    "antivirus_installed": "Yes",
    "vpn_usage": "Yes",
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as artifact:
        for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _major_minor(version: str) -> tuple[str, str] | None:
    parts = str(version).split(".")
    return (parts[0], parts[1]) if len(parts) >= 2 else None


class AwarenessPredictor(Protocol):
    model_version: str

    def predict(self, request: AwarenessPredictionRequest) -> AwarenessPredictionResult: ...


class JoblibAwarenessPredictor:
    """Loads a fitted sklearn-compatible pipeline and normalizes 0-100 to 0-1."""

    def __init__(self) -> None:
        settings = get_settings()
        model_path = settings.model_store_dir / settings.awareness_model_filename
        metadata_path = settings.model_store_dir / settings.awareness_metadata_filename

        if not model_path.is_file():
            raise AwarenessModelUnavailable(f"Awareness model artifact not found: {model_path}")
        if not metadata_path.is_file():
            raise AwarenessModelUnavailable(f"Awareness model metadata not found: {metadata_path}")

        try:
            metadata = json.loads(metadata_path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            raise AwarenessModelUnavailable("Awareness model metadata is invalid") from exc
        if not isinstance(metadata, dict):
            raise AwarenessModelUnavailable("Awareness model metadata is invalid")

        # --- Required keys first, so a document that is missing everything is
        # --- reported as invalid metadata rather than as a version mismatch
        # --- against None, which tells an operator far less.
        missing = [
            key
            for key in (
                "model_version",
                "artifact_sha256",
                "input_features",
                "raw_output_min",
                "raw_output_max",
            )
            if key not in metadata
        ]
        if missing:
            raise AwarenessModelUnavailable(
                f"Awareness model metadata is invalid: missing {', '.join(missing)}"
            )

        # --- Version, next and cheapest. A stale artifact is rejected before it
        # --- is hashed or unpickled, which on a large one is the difference
        # --- between a fast clear failure and a slow confusing one.
        declared_version = metadata.get("model_version")
        expected_version = settings.awareness_model_version
        if declared_version != expected_version:
            raise AwarenessModelUnavailable(
                "Awareness model version mismatch: artifact declares "
                f"{declared_version!r}, this service expects {expected_version!r}. "
                "Retrain with scripts/train_awareness.py or set AWARENESS_MODEL_VERSION."
            )

        # --- Feature contract. The pipeline would happily predict from the wrong
        # --- columns; this is the check that turns confident nonsense into a
        # --- refusal.
        declared_features = metadata.get("input_features")
        if list(SERVICE_FEATURES) != declared_features:
            raise AwarenessModelUnavailable(
                "Awareness model feature contract mismatch: the artifact was "
                "trained on a different set or order of inputs than this service "
                "sends. Retrain with scripts/train_awareness.py."
            )

        # --- Scale. predict() divides by 100, so an artifact on any other scale
        # --- would silently produce a wrong normalized score.
        if (
            metadata.get("raw_output_min") != RAW_OUTPUT_MIN
            or metadata.get("raw_output_max") != RAW_OUTPUT_MAX
        ):
            raise AwarenessModelUnavailable(
                "Awareness model output scale mismatch: this service normalizes a "
                f"{RAW_OUTPUT_MIN}-{RAW_OUTPUT_MAX} score."
            )

        # --- Library compatibility. A pickle is only portable across the version
        # --- that wrote it; sklearn warns on a mismatch and then keeps going,
        # --- which is exactly the silent-wrongness case worth refusing. Absent
        # --- from older metadata, so it is only enforced when recorded.
        recorded_sklearn = metadata.get("sklearn_version")
        if recorded_sklearn is not None:
            if _major_minor(recorded_sklearn) != _major_minor(sklearn.__version__):
                raise AwarenessModelUnavailable(
                    f"Awareness model was built with scikit-learn {recorded_sklearn}, "
                    f"this service runs {sklearn.__version__}. Unpickling across "
                    "versions is not supported; retrain or pin the library."
                )

        expected_hash = metadata.get("artifact_sha256")
        if not isinstance(expected_hash, str) or not expected_hash:
            raise AwarenessModelUnavailable("Awareness model metadata is invalid")
        # Streamed so checksum verification does not hold a second full copy in
        # memory before joblib loads it.
        if _sha256(model_path) != expected_hash:
            raise AwarenessModelUnavailable(
                "Awareness model artifact checksum does not match metadata"
            )

        try:
            # sklearn signals a cross-version unpickle with a warning rather than
            # an error. Promoting it means a mismatch that slipped past the
            # recorded-version check above still cannot load.
            with warnings.catch_warnings():
                warnings.filterwarnings("error", category=UserWarning, module="sklearn.*")
                self._model = joblib.load(model_path)
        except Exception as exc:
            raise AwarenessModelUnavailable(
                f"Awareness model artifact could not be loaded: {model_path}"
            ) from exc

        if not hasattr(self._model, "predict"):
            raise AwarenessModelUnavailable("Awareness model must expose predict()")

        # --- One real prediction, so "it loaded" and "it works" are not
        # --- confused. A pipeline can unpickle cleanly and still fail on the
        # --- first row -- a missing encoder category, a renamed step -- and the
        # --- first user of the day should not be the one to discover that.
        # Deliberately checks only that it runs, not what it returns. Range is
        # validated on every prediction in predict(), and asserting it twice
        # would mean a model that drifts out of range is reported as
        # "unavailable" at boot rather than as the bad score it actually
        # returns -- and every test of range handling would first have to get
        # past this.
        try:
            float(self._model.predict(pd.DataFrame([_SMOKE_ROW]))[0])
        except Exception as exc:
            raise AwarenessModelUnavailable(
                "Awareness model loaded but could not predict"
            ) from exc

        self.model_version = declared_version
        self.metrics: dict[str, Any] = metadata.get("metrics") or {}
        self.trained_at: str | None = metadata.get("trained_at")

    def predict(self, request: AwarenessPredictionRequest) -> AwarenessPredictionResult:
        # Translate the product contract to the exact names and units recorded
        # by the training pipeline. The quiz is stored as 0-1 in the app, while
        # the model was trained on a percentage.
        def yes_no(value: int) -> str:
            return "Yes" if value == 1 else "No"

        row = {
            "department": request.department,
            "work_mode": request.work_mode,
            "daily_email_count": request.emails_per_day,
            "suspicious_email_frequency": request.suspicious_emails_per_day,
            "password_length": request.password_length,
            "password_reuse": yes_no(request.reuses_passwords),
            "password_manager_usage": yes_no(request.uses_password_manager),
            "mfa_enabled": yes_no(request.mfa_enabled),
            "cybersecurity_training": yes_no(request.security_training),
            "security_quiz_score": request.diagnostic_accuracy * 100.0,
            "link_click_tendency": request.clicks_links,
            "attachment_open_rate": request.opens_attachments,
            "verification_before_click": request.verifies_links,
            "reporting_suspicious_email": request.reports_suspicious,
            "antivirus_installed": yes_no(request.has_antivirus),
            "vpn_usage": yes_no(request.uses_vpn),
        }
        # Built in the verified order rather than dict order, so the frame handed
        # to the pipeline is the frame the contract check approved.
        frame = pd.DataFrame([[row[name] for name in SERVICE_FEATURES]], columns=list(SERVICE_FEATURES))

        prediction = self._model.predict(frame)
        try:
            raw_score = float(prediction[0])
        except (IndexError, TypeError, ValueError) as exc:
            raise ValueError("Awareness model returned no numeric prediction") from exc
        if not isfinite(raw_score) or not RAW_OUTPUT_MIN <= raw_score <= RAW_OUTPUT_MAX:
            raise ValueError(
                f"Awareness model returned an invalid "
                f"{RAW_OUTPUT_MIN}-{RAW_OUTPUT_MAX} score: {raw_score}"
            )
        return AwarenessPredictionResult(
            awareness_score=raw_score / RAW_OUTPUT_MAX,
            model_version=self.model_version,
        )


@lru_cache
def get_awareness_predictor() -> AwarenessPredictor:
    return JoblibAwarenessPredictor()
