from typing import Literal

from typing import Literal

from pydantic import BaseModel, Field


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


class AwarenessPredictionResult(BaseModel):
    """Normalized internal result; the application always consumes 0-1."""

    awareness_score: float = Field(..., ge=0.0, le=1.0)
    model_version: str = Field(..., min_length=1)


class AwarenessPredictionResponse(AwarenessPredictionResult):
    """Validated response returned to the Next.js application."""


class AwarenessPredictionRequest(BaseModel):
    """The onboarding feature vector consumed by the awareness model."""

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
    department: str = Field(..., min_length=1)
    work_mode: Literal["Remote", "Hybrid", "Office"]
    diagnostic_accuracy: float = Field(..., ge=0.0, le=1.0)


class AwarenessPredictionResult(BaseModel):
    """Normalized internal result; the application always consumes 0-1."""

    awareness_score: float = Field(..., ge=0.0, le=1.0)
    model_version: str = Field(..., min_length=1)


class AwarenessPredictionResponse(AwarenessPredictionResult):
    """Validated response returned to the Next.js application."""
