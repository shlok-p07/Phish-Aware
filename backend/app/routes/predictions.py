from fastapi import APIRouter, Depends, HTTPException

from app.controllers.awareness_controller import predict_awareness
from app.controllers.prediction_controller import classify_message
from app.models.awareness_predictor import (
    AwarenessModelUnavailable,
    AwarenessPredictor,
    get_awareness_predictor,
)
from app.models.predictor import Predictor, get_predictor
from app.models.schemas import (
    AwarenessPredictionRequest,
    AwarenessPredictionResponse,
    MessageClassificationRequest,
    MessageClassificationResponse,
)

router = APIRouter(prefix="/predictions", tags=["predictions"])


def available_awareness_predictor() -> AwarenessPredictor:
    try:
        return get_awareness_predictor()
    except AwarenessModelUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/classify", response_model=MessageClassificationResponse)
def classify(
    body: MessageClassificationRequest,
    predictor: Predictor = Depends(get_predictor),
) -> MessageClassificationResponse:
    return classify_message(body, predictor)


@router.post("/awareness", response_model=AwarenessPredictionResponse)
def awareness(
    body: AwarenessPredictionRequest,
    predictor: AwarenessPredictor = Depends(available_awareness_predictor),
) -> AwarenessPredictionResponse:
    try:
        return predict_awareness(body, predictor)
    except Exception as exc:
        # Inference is an optional enhancement to onboarding. Present a stable
        # unavailable response so the Next.js caller can use diagnostic
        # accuracy, without leaking model/library internals to the client.
        raise HTTPException(
            status_code=503,
            detail="Awareness model inference failed",
        ) from exc
