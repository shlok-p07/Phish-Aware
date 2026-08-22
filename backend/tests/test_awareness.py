from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

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


class RecordingAwarenessPredictor:
    model_version = "mock-awareness-v1"

    def __init__(self, score=0.42):
        self.score = score
        self.requests = []

    def predict(self, request):
        self.requests.append(request)
        return AwarenessPredictionResult(
            awareness_score=self.score,
            model_version=self.model_version,
        )


class RawScoreModel:
    """Records the frame it was handed; the test does the asserting.

    It used to assert inside predict(), which meant any mismatch surfaced as
    "model loaded but could not predict" from the load-time smoke call rather
    than as the field that was actually wrong.
    """

    def __init__(self):
        self.last_frame = None

    def predict(self, frame):
        self.last_frame = frame.copy()
        return [73.0]


class ConfigurableRawScoreModel:
    def __init__(self, prediction):
        self.prediction = prediction

    def predict(self, frame):
        return self.prediction


#: Where ExactMappingModel leaves the frame it was handed. Module level because
#: the stub is pickled and unpickled by the loader, so the predictor holds a copy
#: -- anything recorded on the instance the test kept is never written to.
SEEN_FRAMES: list = []


class ExactMappingModel:
    """Records the frame; the test asserts. See RawScoreModel for why."""

    def predict(self, frame):
        SEEN_FRAMES.append(frame.copy())
        return [73.0]


class BrokenInferencePredictor:
    model_version = "broken-v1"

    def predict(self, request):
        raise RuntimeError("sensitive internal inference details")


class NoPredictMethod:
    pass


def post_awareness(payload):
    app.dependency_overrides[available_awareness_predictor] = (
        lambda: FakeAwarenessPredictor()
    )
    try:
        return TestClient(app).post("/predictions/awareness", json=payload)
    finally:
        app.dependency_overrides.clear()


def post_with_mock_awareness_predictor(payload, predictor):
    app.dependency_overrides[available_awareness_predictor] = lambda: predictor
    try:
        return TestClient(app).post("/predictions/awareness", json=payload)
    finally:
        app.dependency_overrides.clear()


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


def test_awareness_route_forwards_validated_request_to_mock_predictor():
    predictor = RecordingAwarenessPredictor()
    response = post_with_mock_awareness_predictor(VALID_REQUEST, predictor)

    assert response.status_code == 200
    assert len(predictor.requests) == 1
    request = predictor.requests[0]
    assert request.emails_per_day == 50
    assert request.department == "Engineering"
    assert request.work_mode == "Hybrid"
    assert request.diagnostic_accuracy == 0.8


def test_awareness_route_returns_mock_predictor_result_unchanged():
    response = post_with_mock_awareness_predictor(
        VALID_REQUEST,
        RecordingAwarenessPredictor(score=0.42),
    )

    assert response.status_code == 200
    assert response.json() == {
        "awareness_score": 0.42,
        "model_version": "mock-awareness-v1",
    }


def test_awareness_invalid_request_never_calls_mock_predictor():
    predictor = RecordingAwarenessPredictor()
    response = post_with_mock_awareness_predictor(
        {**VALID_REQUEST, "diagnostic_accuracy": 2.0},
        predictor,
    )

    assert response.status_code == 422
    assert predictor.requests == []


def test_awareness_route_returns_503_when_predictor_dependency_is_unavailable():
    def unavailable_predictor():
        raise HTTPException(status_code=503, detail="mock model unavailable")

    app.dependency_overrides[available_awareness_predictor] = unavailable_predictor
    try:
        response = TestClient(app).post("/predictions/awareness", json=VALID_REQUEST)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {"detail": "mock model unavailable"}


def test_awareness_route_returns_controlled_503_when_inference_fails():
    response = post_with_mock_awareness_predictor(
        VALID_REQUEST,
        BrokenInferencePredictor(),
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Awareness model inference failed"}
    assert "sensitive internal" not in response.text


def test_awareness_rejects_out_of_range_features():
    response = post_awareness({**VALID_REQUEST, "diagnostic_accuracy": 1.2})
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("emails_per_day", -1),
        ("emails_per_day", 1001),
        ("password_length", 0),
        ("password_length", 129),
        ("reuses_passwords", 2),
        ("clicks_links", -1),
        ("clicks_links", 101),
        ("diagnostic_accuracy", -0.01),
        ("diagnostic_accuracy", 1.01),
        ("department", "Unknown"),
        ("work_mode", "Field"),
    ],
)
def test_awareness_rejects_invalid_feature_boundaries(field, invalid_value):
    response = post_awareness({**VALID_REQUEST, field: invalid_value})
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("field", "valid_value"),
    [
        ("emails_per_day", 0),
        ("emails_per_day", 1000),
        ("password_length", 1),
        ("password_length", 128),
        ("clicks_links", 0),
        ("clicks_links", 100),
        ("diagnostic_accuracy", 0.0),
        ("diagnostic_accuracy", 1.0),
    ],
)
def test_awareness_accepts_inclusive_feature_boundaries(field, valid_value):
    payload = {**VALID_REQUEST, field: valid_value}
    if field == "emails_per_day" and valid_value == 0:
        payload["suspicious_emails_per_day"] = 0
    response = post_awareness(payload)
    assert response.status_code == 200


def test_awareness_rejects_missing_required_feature():
    payload = {**VALID_REQUEST}
    del payload["password_length"]
    response = post_awareness(payload)
    assert response.status_code == 422


def test_awareness_rejects_non_numeric_feature():
    response = post_awareness({**VALID_REQUEST, "clicks_links": "often"})
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("field", "coerced_value"),
    [
        ("emails_per_day", "50"),
        ("emails_per_day", 50.5),
        ("diagnostic_accuracy", "0.8"),
        ("reuses_passwords", "1"),
    ],
)
def test_awareness_rejects_values_that_would_require_type_coercion(
    field, coerced_value
):
    response = post_awareness({**VALID_REQUEST, field: coerced_value})
    assert response.status_code == 422


def test_awareness_rejects_unknown_features():
    response = post_awareness({**VALID_REQUEST, "unexpected_feature": 123})
    assert response.status_code == 422


@pytest.mark.parametrize(
    "changes",
    [
        {"mfa_familiar": 0, "mfa_enabled": 1},
        {"emails_per_day": 2, "suspicious_emails_per_day": 3},
    ],
)
def test_awareness_rejects_logically_inconsistent_features(changes):
    response = post_awareness({**VALID_REQUEST, **changes})
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
    from app.models.awareness_predictor import SERVICE_FEATURES
    import sklearn

    metadata.write_text(json.dumps({
        "artifact_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
        "model_version": "test-v1",
        "input_features": list(SERVICE_FEATURES),
        "raw_output_min": 0,
        "raw_output_max": 100,
        "sklearn_version": sklearn.__version__,
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


def test_joblib_predictor_maps_every_request_field_to_exact_model_contract(
    tmp_path, monkeypatch
):
    from app.models.awareness_predictor import SERVICE_FEATURES

    SEEN_FRAMES.clear()
    predictor = make_joblib_predictor(tmp_path, monkeypatch, ExactMappingModel())
    predictor.predict(valid_awareness_request())

    # The last frame, not the first: loading runs a smoke prediction of its own.
    frame = SEEN_FRAMES[-1]
    # Order matters as much as content: the pipeline was fitted on this order.
    assert frame.columns.tolist() == list(SERVICE_FEATURES)
    assert frame.iloc[0].to_dict() == {
            "department": "Engineering",
            "work_mode": "Hybrid",
            "daily_email_count": 50,
            "suspicious_email_frequency": 2,
            "password_length": 16,
            "password_reuse": "No",
            "password_manager_usage": "Yes",
            "mfa_enabled": "Yes",
            "cybersecurity_training": "Yes",
            "security_quiz_score": 80.0,
            "link_click_tendency": 30,
            "attachment_open_rate": 20,
            "verification_before_click": 80,
            "reporting_suspicious_email": 70,
            "antivirus_installed": "Yes",
            "vpn_usage": "Yes",
        }


@pytest.mark.parametrize(
    ("raw_score", "normalized"),
    [(0.0, 0.0), (100.0, 1.0)],
)
def test_joblib_predictor_accepts_score_boundaries(
    tmp_path, monkeypatch, raw_score, normalized
):
    predictor = make_joblib_predictor(
        tmp_path, monkeypatch, ConfigurableRawScoreModel([raw_score])
    )
    result = predictor.predict(valid_awareness_request())
    assert result.awareness_score == normalized


@pytest.mark.parametrize(
    "prediction",
    [[float("nan")], [float("inf")], [-0.01], [100.01]],
)
def test_joblib_predictor_rejects_invalid_model_output(
    tmp_path, monkeypatch, prediction
):
    # These load fine -- a number is a number -- and are refused per prediction,
    # which is where a model that drifts out of range has to be caught.
    predictor = make_joblib_predictor(
        tmp_path, monkeypatch, ConfigurableRawScoreModel(prediction)
    )
    with pytest.raises(ValueError):
        predictor.predict(valid_awareness_request())


@pytest.mark.parametrize("prediction", [[], ["not-a-number"]])
def test_joblib_predictor_refuses_to_load_a_model_that_cannot_produce_a_number(
    tmp_path, monkeypatch, prediction
):
    from app.models.awareness_predictor import AwarenessModelUnavailable

    # A model that returns nothing, or something that is not a number, is broken
    # rather than wrong -- the load-time smoke prediction catches it so the first
    # user of the day is not the one to discover it.
    with pytest.raises(AwarenessModelUnavailable, match="could not predict"):
        make_joblib_predictor(
            tmp_path, monkeypatch, ConfigurableRawScoreModel(prediction)
        )


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


def valid_awareness_request():
    from app.models.schemas import AwarenessPredictionRequest

    return AwarenessPredictionRequest.model_validate(VALID_REQUEST)


def make_joblib_predictor(tmp_path, monkeypatch, model, *, metadata_overrides=None):
    import hashlib
    import json
    import joblib

    from app.core.config import get_settings
    from app.models.awareness_predictor import JoblibAwarenessPredictor

    artifact = tmp_path / "test-model.joblib"
    joblib.dump(model, artifact)
    from app.models.awareness_predictor import SERVICE_FEATURES
    import sklearn

    # The full contract by default, so a test only has to say what it is
    # breaking. The loader verifies all of this before it will serve anything.
    metadata_values = {
        "artifact_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
        "model_version": "test-v1",
        "input_features": list(SERVICE_FEATURES),
        "raw_output_min": 0,
        "raw_output_max": 100,
        "sklearn_version": sklearn.__version__,
        **(metadata_overrides or {}),
    }
    metadata = tmp_path / "test-model.metadata.json"
    metadata.write_text(json.dumps(metadata_values))

    settings = get_settings()
    monkeypatch.setattr(settings, "model_store_dir", tmp_path)
    monkeypatch.setattr(settings, "awareness_model_filename", artifact.name)
    monkeypatch.setattr(settings, "awareness_metadata_filename", metadata.name)
    monkeypatch.setattr(settings, "awareness_model_version", "test-v1")
    return JoblibAwarenessPredictor()


def test_joblib_predictor_rejects_checksum_mismatch(tmp_path, monkeypatch):
    from app.models.awareness_predictor import AwarenessModelUnavailable

    with pytest.raises(AwarenessModelUnavailable, match="checksum"):
        make_joblib_predictor(
            tmp_path,
            monkeypatch,
            ConfigurableRawScoreModel([50.0]),
            metadata_overrides={"artifact_sha256": "0" * 64},
        )


def test_joblib_predictor_rejects_model_version_mismatch(tmp_path, monkeypatch):
    from app.models.awareness_predictor import AwarenessModelUnavailable

    with pytest.raises(AwarenessModelUnavailable, match="version"):
        make_joblib_predictor(
            tmp_path,
            monkeypatch,
            ConfigurableRawScoreModel([50.0]),
            metadata_overrides={"model_version": "wrong-v2"},
        )


@pytest.mark.parametrize("metadata_text", ["not json", "{}"])
def test_joblib_predictor_rejects_invalid_metadata(
    tmp_path, monkeypatch, metadata_text
):
    import joblib

    from app.core.config import get_settings
    from app.models.awareness_predictor import (
        AwarenessModelUnavailable,
        JoblibAwarenessPredictor,
    )

    artifact = tmp_path / "test-model.joblib"
    joblib.dump(ConfigurableRawScoreModel([50.0]), artifact)
    metadata = tmp_path / "test-model.metadata.json"
    metadata.write_text(metadata_text)
    settings = get_settings()
    monkeypatch.setattr(settings, "model_store_dir", tmp_path)
    monkeypatch.setattr(settings, "awareness_model_filename", artifact.name)
    monkeypatch.setattr(settings, "awareness_metadata_filename", metadata.name)

    with pytest.raises(AwarenessModelUnavailable, match="metadata is invalid"):
        JoblibAwarenessPredictor()


def test_joblib_predictor_rejects_corrupt_artifact(tmp_path, monkeypatch):
    import hashlib
    import json

    from app.core.config import get_settings
    from app.models.awareness_predictor import (
        AwarenessModelUnavailable,
        JoblibAwarenessPredictor,
    )

    artifact = tmp_path / "corrupt.joblib"
    artifact.write_bytes(b"this is not a joblib artifact")
    metadata = tmp_path / "test-model.metadata.json"
    from app.models.awareness_predictor import SERVICE_FEATURES
    import sklearn

    # A complete, honest contract: this test is about the artifact being
    # unreadable, so everything before that step has to pass.
    metadata.write_text(json.dumps({
        "artifact_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
        "input_features": list(SERVICE_FEATURES),
        "raw_output_min": 0,
        "raw_output_max": 100,
        "sklearn_version": sklearn.__version__,
        "model_version": "test-v1",
    }))
    settings = get_settings()
    monkeypatch.setattr(settings, "model_store_dir", tmp_path)
    monkeypatch.setattr(settings, "awareness_model_filename", artifact.name)
    monkeypatch.setattr(settings, "awareness_metadata_filename", metadata.name)
    monkeypatch.setattr(settings, "awareness_model_version", "test-v1")

    with pytest.raises(AwarenessModelUnavailable, match="could not be loaded"):
        JoblibAwarenessPredictor()


def test_joblib_predictor_rejects_loaded_object_without_predict(
    tmp_path, monkeypatch
):
    from app.models.awareness_predictor import AwarenessModelUnavailable

    with pytest.raises(AwarenessModelUnavailable, match="must expose predict"):
        make_joblib_predictor(tmp_path, monkeypatch, NoPredictMethod())
