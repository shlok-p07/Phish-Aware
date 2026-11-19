from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.models.schemas import MessageClassificationResult
from app.models.predictor import get_predictor

client = TestClient(app)


class MockPredictor:
    def __init__(self, probability=0.75):
        self.probability = probability
        self.requests = []

    def predict(self, request):
        self.requests.append(request)
        return MessageClassificationResult(
            phishing_probability=self.probability,
            model_version="mock-classifier-v1",
        )


def post_with_mock_predictor(payload, predictor):
    app.dependency_overrides[get_predictor] = lambda: predictor
    try:
        return client.post("/predictions/classify", json=payload)
    finally:
        app.dependency_overrides.clear()


def test_classify_flags_suspicious_message():
    response = client.post(
        "/predictions/classify",
        json={
            "subject": "Urgent: verify your account",
            "body": "Click here now or your account will be suspended.",
            "sender": "security@not-a-real-bank.com",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["verdict"] is True
    assert 0.0 <= body["phishing_probability"] <= 1.0
    assert body["model_version"] == "heuristic-v0"


def test_classify_passes_benign_message():
    response = client.post(
        "/predictions/classify",
        json={
            "subject": "Lunch tomorrow?",
            "body": "Are you free to grab lunch tomorrow at noon?",
            "sender": "coworker@example.com",
        },
    )
    assert response.status_code == 200
    assert response.json()["verdict"] is False


def test_classify_requires_body():
    response = client.post("/predictions/classify", json={"subject": "Hi"})
    assert response.status_code == 422


def test_classify_route_forwards_validated_fields_to_mock_predictor():
    predictor = MockPredictor()
    response = post_with_mock_predictor(
        {
            "subject": "Quarterly report",
            "body": "Please review the attached report.",
            "sender": "manager@example.com",
        },
        predictor,
    )

    assert response.status_code == 200
    assert len(predictor.requests) == 1
    request = predictor.requests[0]
    assert request.subject == "Quarterly report"
    assert request.body == "Please review the attached report."
    assert request.sender == "manager@example.com"


def test_classify_route_shapes_mock_predictor_result():
    response = post_with_mock_predictor(
        {"body": "Controlled test message"},
        MockPredictor(probability=0.75),
    )

    assert response.status_code == 200
    assert response.json() == {
        "phishing_probability": 0.75,
        "verdict": True,
        "model_version": "mock-classifier-v1",
    }


def test_classify_invalid_request_never_calls_mock_predictor():
    predictor = MockPredictor()
    response = post_with_mock_predictor({"body": ""}, predictor)

    assert response.status_code == 422
    assert predictor.requests == []


def test_classify_rejects_empty_body():
    response = client.post("/predictions/classify", json={"body": ""})
    assert response.status_code == 422


def test_classify_uses_empty_defaults_for_optional_fields():
    response = client.post(
        "/predictions/classify",
        json={"body": "Ordinary project status update."},
    )
    assert response.status_code == 200
    assert response.json() == {
        "phishing_probability": 0.0,
        "verdict": False,
        "model_version": "heuristic-v0",
    }


def test_classify_keyword_matching_is_case_insensitive():
    response = client.post(
        "/predictions/classify",
        json={"body": "URGENT: CLICK HERE to VERIFY YOUR ACCOUNT."},
    )
    assert response.status_code == 200
    assert response.json()["phishing_probability"] == 1.0
    assert response.json()["verdict"] is True


def test_classify_probability_is_capped_at_one():
    response = client.post(
        "/predictions/classify",
        json={
            "subject": "Urgent: act now",
            "body": (
                "Click here to verify your account before it is suspended. "
                "Confirm your password, purchase a gift card, and make a wire transfer."
            ),
        },
    )
    assert response.status_code == 200
    assert response.json()["phishing_probability"] == 1.0


@pytest.mark.parametrize(
    ("probability", "expected_verdict"),
    [(0.4999, False), (0.5, True)],
)
def test_classify_threshold_boundary(probability, expected_verdict):
    class BoundaryPredictor:
        def predict(self, request):
            return MessageClassificationResult(
                phishing_probability=probability,
                model_version="boundary-test-v1",
            )

    app.dependency_overrides[get_predictor] = lambda: BoundaryPredictor()
    try:
        response = client.post("/predictions/classify", json={"body": "Test message"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["verdict"] is expected_verdict
    assert response.json()["phishing_probability"] == probability
