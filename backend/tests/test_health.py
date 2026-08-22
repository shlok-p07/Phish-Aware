from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_readyz_reports_the_loaded_model_and_its_version():
    from app.core.config import get_settings
    from app.models.awareness_predictor import get_awareness_predictor

    get_awareness_predictor.cache_clear()
    body = TestClient(app).get("/readyz").json()

    # A deployment could previously only answer "is the process up", so running
    # with no model looked exactly like running with one.
    assert body["status"] == "ok"
    assert body["awareness_model"]["loaded"] is True
    assert body["awareness_model"]["version"] == get_settings().awareness_model_version


def test_readyz_reports_degraded_and_why_when_no_model_is_present(tmp_path, monkeypatch):
    from app.core.config import get_settings
    from app.models.awareness_predictor import get_awareness_predictor

    monkeypatch.setattr(get_settings(), "model_store_dir", tmp_path)
    get_awareness_predictor.cache_clear()

    response = TestClient(app).get("/readyz")
    body = response.json()

    # 200 on purpose: a missing awareness model must not take the service out of
    # a load balancer while message classification still works.
    assert response.status_code == 200
    assert body["status"] == "degraded"
    assert body["awareness_model"]["loaded"] is False
    assert body["awareness_model"]["expected_version"] == get_settings().awareness_model_version
    assert "not found" in body["awareness_model"]["reason"]
    get_awareness_predictor.cache_clear()


def test_healthz_does_not_depend_on_the_model(tmp_path, monkeypatch):
    from app.core.config import get_settings
    from app.models.awareness_predictor import get_awareness_predictor

    monkeypatch.setattr(get_settings(), "model_store_dir", tmp_path)
    get_awareness_predictor.cache_clear()

    # Liveness must stay green with no model, or a missing artifact would look
    # like a dead process and get the container restarted in a loop.
    assert TestClient(app).get("/healthz").json()["status"] == "ok"
    get_awareness_predictor.cache_clear()
