from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import AwarenessPredictionResult
from app.routes.predictions import available_awareness_predictor


VALID_REQUEST = {
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
    "department": "Engineering",
    "work_mode": "Hybrid",
    "diagnostic_accuracy": 0.8,
}


class FakeAwarenessPredictor:
    model_version = "awareness-test-v1"

    def predict(self, request):
        assert request.department == "Engineering"
        return AwarenessPredictionResult(
            awareness_score=0.73,
            model_version=self.model_version,
        )


class RawScoreModel:
    def predict(self, frame):
        assert frame.iloc[0]["security_quiz_score"] == 80.0
        assert frame.iloc[0]["daily_email_count"] == 50
        assert frame.iloc[0]["password_reuse"] == "No"
        assert frame.iloc[0]["password_manager_usage"] == "Yes"
        return [73.0]


def test_awareness_returns_validated_normalized_score():
    app.dependency_overrides[available_awareness_predictor] = (
        lambda: FakeAwarenessPredictor()
    )
    try:
        response = TestClient(app).post("/predictions/awareness", json=VALID_REQUEST)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "awareness_score": 0.73,
        "model_version": "awareness-test-v1",
    }


def test_awareness_rejects_out_of_range_features():
    app.dependency_overrides[available_awareness_predictor] = (
        lambda: FakeAwarenessPredictor()
    )
    try:
        response = TestClient(app).post(
            "/predictions/awareness",
            json={**VALID_REQUEST, "diagnostic_accuracy": 1.2},
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422


def test_joblib_predictor_normalizes_raw_0_to_100_score(tmp_path, monkeypatch):
    import joblib

    from app.core.config import get_settings
    from app.models.awareness_predictor import JoblibAwarenessPredictor
    from app.models.schemas import AwarenessPredictionRequest

    artifact = tmp_path / "test-model.joblib"
    joblib.dump(RawScoreModel(), artifact)
    import hashlib
    import json

    metadata = tmp_path / "test-model.metadata.json"
    metadata.write_text(json.dumps({
        "artifact_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
        "model_version": "test-v1",
    }))
    settings = get_settings()
    monkeypatch.setattr(settings, "model_store_dir", tmp_path)
    monkeypatch.setattr(settings, "awareness_model_filename", artifact.name)
    monkeypatch.setattr(settings, "awareness_metadata_filename", metadata.name)
    monkeypatch.setattr(settings, "awareness_model_version", "test-v1")

    result = JoblibAwarenessPredictor().predict(
        AwarenessPredictionRequest.model_validate(VALID_REQUEST)
    )
    assert result.awareness_score == 0.73
    assert result.model_version == "test-v1"


def test_awareness_is_unavailable_without_artifact(tmp_path, monkeypatch):
    from app.core.config import get_settings
    from app.models.awareness_predictor import get_awareness_predictor

    settings = get_settings()
    monkeypatch.setattr(settings, "model_store_dir", tmp_path)
    get_awareness_predictor.cache_clear()
    try:
        response = TestClient(app).post("/predictions/awareness", json=VALID_REQUEST)
    finally:
        get_awareness_predictor.cache_clear()

    assert response.status_code == 503
