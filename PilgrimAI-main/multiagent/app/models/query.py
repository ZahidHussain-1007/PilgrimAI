from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1)
    session_id: str | None = None
    # v19: landing language chips (en/te/hi) — optional reply-language
    # override; brain still auto-detects when absent.
    language: str | None = None
