"""Integration coverage for the checked metadata and real joblib pipeline.

These tests intentionally do not run in the normal fast suite. The production
artifact is roughly 515 MB, so opt in with RUN_MODEL_INTEGRATION=1.
"""

import json
import os

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.models.awareness_predictor import get_awareness_predictor


pytestmark = [
    pytest.mark.integration,
    pytest.mark.model_integration,
    pytest.mark.skipif(
        os.getenv("RUN_MODEL_INTEGRATION") != "1",
        reason="set RUN_MODEL_INTEGRATION=1 to load the real model artifact",
    ),
]


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

EXPECTED_MODEL_FEATURES = [
    "department",
    "work_mode",
    "daily_email_count",
    "suspicious_email_frequency",
    "password_length",
    "password_reuse",
    "password_manager_usage",
    "mfa_enabled",
    "cybersecurity_training",
    "security_quiz_score",
    "link_click_tendency",
    "attachment_open_rate",
    "verification_before_click",
    "reporting_suspicious_email",
    "antivirus_installed",
    "vpn_usage",
]

DEPARTMENTS = [
    "Customer Support",
    "Engineering",
    "Executive",
    "Finance",
    "HR",
    "IT",
    "Legal",
    "Marketing",
    "Operations",
    "Sales",
]
WORK_MODES = ["Remote", "Hybrid", "Office"]


@pytest.fixture(scope="module", autouse=True)
def clear_predictor_cache():
    get_settings.cache_clear()
    get_awareness_predictor.cache_clear()
    yield
    get_awareness_predictor.cache_clear()
    get_settings.cache_clear()


def test_real_metadata_matches_the_deployed_feature_contract():
    settings = get_settings()
    metadata_path = settings.model_store_dir / settings.awareness_metadata_filename

    assert metadata_path.is_file(), f"Missing model metadata: {metadata_path}"
    metadata = json.loads(metadata_path.read_text())
    assert metadata["model_version"] == settings.awareness_model_version
    assert metadata["input_features"] == EXPECTED_MODEL_FEATURES
    assert metadata["raw_output_min"] == 0
    assert metadata["raw_output_max"] == 100
    assert metadata["production_normalization"] == "raw_score / 100"


def test_awareness_endpoint_runs_the_real_joblib_pipeline_end_to_end():
    response = TestClient(app).post("/predictions/awareness", json=VALID_REQUEST)

    assert response.status_code == 200, response.text
    result = response.json()
    assert 0.0 <= result["awareness_score"] <= 1.0
    assert result["model_version"] == get_settings().awareness_model_version


def test_real_predictor_is_cached_after_the_first_artifact_load():
    first = get_awareness_predictor()
    second = get_awareness_predictor()

    assert first is second


def test_real_model_preserves_expected_awareness_persona_ordering():
    low_awareness = {
        **VALID_REQUEST,
        "password_length": 6,
        "reuses_passwords": 1,
        "uses_password_manager": 0,
        "mfa_familiar": 0,
        "mfa_enabled": 0,
        "security_training": 0,
        "clicks_links": 95,
        "opens_attachments": 95,
        "verifies_links": 5,
        "reports_suspicious": 5,
        "has_antivirus": 0,
        "uses_vpn": 0,
        "diagnostic_accuracy": 0.1,
    }
    high_awareness = {
        **VALID_REQUEST,
        "password_length": 24,
        "clicks_links": 5,
        "opens_attachments": 5,
        "verifies_links": 95,
        "reports_suspicious": 95,
        "diagnostic_accuracy": 1.0,
    }
    client = TestClient(app)

    low = client.post("/predictions/awareness", json=low_awareness).json()["awareness_score"]
    medium = client.post("/predictions/awareness", json=VALID_REQUEST).json()["awareness_score"]
    high = client.post("/predictions/awareness", json=high_awareness).json()["awareness_score"]

    assert 0.2 <= low <= 0.5
    assert 0.7 <= medium <= 0.9
    assert 0.9 <= high <= 1.0
    assert low < medium < high


@pytest.mark.parametrize("department", DEPARTMENTS)
@pytest.mark.parametrize("work_mode", WORK_MODES)
def test_real_model_accepts_every_product_category(department, work_mode):
    response = TestClient(app).post(
        "/predictions/awareness",
        json={**VALID_REQUEST, "department": department, "work_mode": work_mode},
    )

    assert response.status_code == 200, response.text
    assert 0.0 <= response.json()["awareness_score"] <= 1.0
