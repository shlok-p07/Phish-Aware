from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Runtime configuration, loaded from environment variables / .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "PhishAware ML Service"
    environment: str = "development"

    # Where trained model artifacts live once real training happens.
    model_store_dir: Path = BACKEND_ROOT / "models_store"
    awareness_model_filename: str = "phishing_awareness_v1.joblib"
    awareness_metadata_filename: str = "phishing_awareness_v1.metadata.json"
    awareness_model_version: str = "awareness-v1.0.0"
    # Where raw/processed datasets live once real data arrives.
    data_dir: Path = BACKEND_ROOT / "data"

    # Origins allowed to call this API (the Next.js app, in dev and prod).
    # May be set as a comma-separated string via the CORS_ORIGINS env var.
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_comma_separated(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
