from typing import Any

from fastapi import APIRouter

from app.core.config import get_settings
from app.models.awareness_predictor import (
    AwarenessModelUnavailable,
    get_awareness_predictor,
)

router = APIRouter(tags=["health"])


@router.get("/healthz")
def health_check() -> dict[str, str]:
    """Liveness only: is the process up. Deliberately does not touch the model."""
    return {"status": "ok", "service": get_settings().app_name}


@router.get("/readyz")
def readiness_check() -> dict[str, Any]:
    """
    Whether the awareness model is loaded, and which one.

    /healthz answers "is the process up", which was the only question this
    service could answer -- so a deployment running with no model, or with a
    stale one, looked exactly like a healthy deployment. The app degrades to
    diagnostic quiz accuracy in that state and says nothing, which is the right
    runtime behaviour and the wrong thing to be silent about.

    Always 200: this reports status, it does not fail on it. A load balancer
    should not pull the service out for a missing model when message
    classification still works.
    """
    settings = get_settings()
    try:
        predictor = get_awareness_predictor()
    except AwarenessModelUnavailable as exc:
        return {
            "status": "degraded",
            "awareness_model": {
                "loaded": False,
                "expected_version": settings.awareness_model_version,
                # The reason, so an operator does not have to read the logs to
                # find out whether it is a missing file, a stale version or a
                # checksum mismatch.
                "reason": str(exc),
            },
        }
    return {
        "status": "ok",
        "awareness_model": {
            "loaded": True,
            "version": getattr(predictor, "model_version", None),
            "trained_at": getattr(predictor, "trained_at", None),
            "metrics": getattr(predictor, "metrics", {}),
        },
    }
