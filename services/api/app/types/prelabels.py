from datetime import datetime

from pydantic import BaseModel, Field

from app.types.base import ResponseModel


class PrelabelRunCreate(BaseModel):
    """Start a pre-label run. Omit `threshold` to use the project's own."""

    threshold: float | None = Field(
        default=None,
        ge=0.05,
        le=0.95,
        description="Minimum detection confidence kept as a suggestion.",
    )


class PrelabelRun(ResponseModel):
    """One pre-label run: every task scored once by the local model, saved to B2."""

    run_id: str = Field(description="`YYYYMMDDTHHMMSSZ-<model-short>`; also the Label Studio model_version.")
    project: str
    model_id: str
    model_revision: str
    device: str = Field(description="torch device the ML backend ran on (cuda, mps or cpu).")
    threshold: float
    tasks: int = Field(description="Tasks scored in this run.")
    boxes: int = Field(description="Suggested boxes across every task.")
    prefix: str = Field(description="B2 prefix holding one JSON per task plus `_run.json`.")
    started_at: datetime
    duration_seconds: float
