"""
Presentation layer: shapes model output into what the API actually returns.
Kept separate from app.models so the decision threshold / response shape can
change without touching prediction logic, and vice versa.
"""

from app.models.schemas import MessageClassificationResponse, MessageClassificationResult

PHISHING_THRESHOLD = 0.5


def render_classification(result: MessageClassificationResult) -> MessageClassificationResponse:
    return MessageClassificationResponse(
        phishing_probability=result.phishing_probability,
        verdict=result.phishing_probability >= PHISHING_THRESHOLD,
        model_version=result.model_version,
    )
