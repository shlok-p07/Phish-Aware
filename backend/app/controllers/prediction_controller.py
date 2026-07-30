from app.models.predictor import Predictor
from app.models.schemas import MessageClassificationRequest, MessageClassificationResponse
from app.views.prediction_view import render_classification


def classify_message(
    request: MessageClassificationRequest,
    predictor: Predictor,
) -> MessageClassificationResponse:
    """Business logic entry point: request in, API response out."""
    result = predictor.predict(request)
    return render_classification(result)
