"""Production adapter for the exported phishing-awareness model artifact."""

from functools import lru_cache
import hashlib
import json
from math import isfinite
from typing import Protocol

import joblib
import pandas as pd

from app.core.config import get_settings
from app.models.schemas import AwarenessPredictionRequest, AwarenessPredictionResult


class AwarenessModelUnavailable(RuntimeError):
    """Raised when the configured model artifact cannot be used."""


def _sha256(path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as artifact:
        for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
            expected_hash = metadata["artifact_sha256"]
            # Stream the 515 MB artifact so checksum verification does not
            # allocate a second full in-memory copy before joblib loads it.
            artifact_hash = _sha256(model_path)
        except (OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
            raise AwarenessModelUnavailable("Awareness model metadata is invalid") from exc
        if artifact_hash != expected_hash:
            raise AwarenessModelUnavailable("Awareness model artifact checksum does not match metadata")
        try:
            self._model = joblib.load(model_path)
        except Exception as exc:
            raise AwarenessModelUnavailable(
                f"Awareness model artifact could not be loaded: {model_path}"
            ) from exc
        if not hasattr(self._model, "predict"):
            raise AwarenessModelUnavailable("Awareness model must expose predict()")
        metadata_version = metadata.get("model_version")
        if metadata_version != settings.awareness_model_version:
            raise AwarenessModelUnavailable(
                "Awareness model version does not match AWARENESS_MODEL_VERSION"
            )
        self.model_version = metadata_version

    def predict(self, request: AwarenessPredictionRequest) -> AwarenessPredictionResult:
        # Translate the product contract to the exact names and units recorded
        # by the Colab training pipeline. The quiz is stored as 0-1 in the app,
        # while the fitted model was trained on a percentage.
        yes_no = lambda value: "Yes" if value == 1 else "No"
        frame = pd.DataFrame([{
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
        }])
        prediction = self._model.predict(frame)
        try:
            raw_score = float(prediction[0])
        except (IndexError, TypeError, ValueError) as exc:
            raise ValueError("Awareness model returned no numeric prediction") from exc
        if not isfinite(raw_score) or not 0.0 <= raw_score <= 100.0:
            raise ValueError(f"Awareness model returned an invalid 0-100 score: {raw_score}")
        return AwarenessPredictionResult(
            awareness_score=raw_score / 100.0,
            model_version=self.model_version,
        )


@lru_cache
def get_awareness_predictor() -> AwarenessPredictor:
    return JoblibAwarenessPredictor()
