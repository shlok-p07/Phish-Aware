from fastapi import APIRouter, Depends

from app.controllers.prediction_controller import classify_message
from app.models.predictor import Predictor, get_predictor
from app.models.schemas import MessageClassificationRequest, MessageClassificationResponse

router = APIRouter(prefix="/predictions", tags=["predictions"])


@router.post("/classify", response_model=MessageClassificationResponse)
def classify(
    body: MessageClassificationRequest,
    predictor: Predictor = Depends(get_predictor),
) -> MessageClassificationResponse:
    return classify_message(body, predictor)
