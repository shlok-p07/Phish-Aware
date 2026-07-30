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
