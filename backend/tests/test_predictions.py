from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


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
