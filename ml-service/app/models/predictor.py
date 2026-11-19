"""
The actual ML model lives here once there's a trained model + dataset.

For now, `HeuristicPredictor` is a real, working stand-in so the rest of the
stack (routes -> controllers -> views) is genuinely testable end-to-end
today, not just scaffolding. Swap it out via `get_predictor()` once a real
model exists -- nothing above this module needs to change.
"""

from functools import lru_cache

from app.core.config import get_settings
from app.models.schemas import MessageClassificationRequest, MessageClassificationResult

_SUSPICIOUS_KEYWORDS = (
    "verify your account",
    "urgent",
    "act now",
    "click here",
    "suspended",
    "confirm your password",
    "gift card",
    "wire transfer",
)


class Predictor:
    """Interface every real predictor implementation should match."""

    model_version: str

    def predict(self, request: MessageClassificationRequest) -> MessageClassificationResult:
        raise NotImplementedError


class HeuristicPredictor(Predictor):
    """
    Placeholder: scores a message by counting suspicious keyword hits.
    Deterministic and dependency-free, purely so this endpoint works before
    a real model exists.

    TODO(ml): replace with a real trained model, e.g.:
        import joblib
        self._model = joblib.load(get_settings().model_store_dir / "phishing_classifier.joblib")
        ...
        self._model.predict_proba(features)[0][1]
    """

    model_version = "heuristic-v0"

    def predict(self, request: MessageClassificationRequest) -> MessageClassificationResult:
        text = f"{request.subject} {request.body}".lower()
        hits = sum(1 for kw in _SUSPICIOUS_KEYWORDS if kw in text)
        probability = min(1.0, hits / 3)
        return MessageClassificationResult(
            phishing_probability=probability,
            model_version=self.model_version,
        )


@lru_cache
def get_predictor() -> Predictor:
    get_settings()  # touch settings so config errors surface at startup
    return HeuristicPredictor()
