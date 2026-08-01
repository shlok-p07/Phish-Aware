from app.models.awareness_predictor import AwarenessPredictor
from app.models.schemas import (
    AwarenessPredictionRequest,
    AwarenessPredictionResponse,
)


def predict_awareness(
    request: AwarenessPredictionRequest,
    predictor: AwarenessPredictor,
) -> AwarenessPredictionResponse:
    result = predictor.predict(request)
    return AwarenessPredictionResponse.model_validate(result.model_dump())
