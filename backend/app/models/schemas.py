from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class MessageClassificationRequest(BaseModel):
    """A message to score for phishing likelihood."""

    subject: str = Field(default="", description="Message subject line, if any")
    body: str = Field(..., min_length=1, description="Message body text")
    sender: str = Field(default="", description="Raw sender / display name + address")


class MessageClassificationResult(BaseModel):
    """Model output before it's shaped into an API response."""

    phishing_probability: float = Field(..., ge=0.0, le=1.0)
    model_version: str


class MessageClassificationResponse(BaseModel):
    """What the API actually returns to callers."""

    phishing_probability: float = Field(..., ge=0.0, le=1.0)
    verdict: bool = Field(..., description="True if judged likely phishing")
    model_version: str


class AwarenessPredictionRequest(BaseModel):
    """The onboarding feature vector consumed by the awareness model."""

    model_config = ConfigDict(extra="forbid", strict=True)

    emails_per_day: int = Field(..., ge=0, le=1000)
    suspicious_emails_per_day: int = Field(..., ge=0, le=1000)
    password_length: int = Field(..., ge=1, le=128)
    reuses_passwords: int = Field(..., ge=0, le=1)
    uses_password_manager: int = Field(..., ge=0, le=1)
    mfa_familiar: int = Field(..., ge=0, le=1)
    mfa_enabled: int = Field(..., ge=0, le=1)
    security_training: int = Field(..., ge=0, le=1)
    clicks_links: int = Field(..., ge=0, le=100)
    opens_attachments: int = Field(..., ge=0, le=100)
    verifies_links: int = Field(..., ge=0, le=100)
    reports_suspicious: int = Field(..., ge=0, le=100)
    has_antivirus: int = Field(..., ge=0, le=1)
    uses_vpn: int = Field(..., ge=0, le=1)
    department: Literal[
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
    work_mode: Literal["Remote", "Hybrid", "Office"]
    diagnostic_accuracy: float = Field(..., ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_feature_relationships(self):
        if self.mfa_familiar == 0 and self.mfa_enabled != 0:
            raise ValueError("mfa_enabled must be 0 when mfa_familiar is 0")
        if self.suspicious_emails_per_day > self.emails_per_day:
            raise ValueError(
                "suspicious_emails_per_day cannot exceed emails_per_day"
            )
        return self


class AwarenessPredictionResult(BaseModel):
    """Normalized internal result; the application always consumes 0-1."""

    awareness_score: float = Field(..., ge=0.0, le=1.0)
    model_version: str = Field(..., min_length=1)


class AwarenessPredictionResponse(AwarenessPredictionResult):
    """Validated response returned to the Next.js application."""
