from typing import Literal

from pydantic import Field

from app.types.base import ResponseModel

FlagReason = Literal[
    "missing_annotation",
    "missing_prelabel",
    "missing_source_object",
    "missing_in_export",
    "missing_task",
]


class FlaggedTask(ResponseModel):
    """A task (or a raw image with no task yet) that blocks a release."""

    task_id: int | None = Field(description="Label Studio task id; null for a raw image never synced.")
    source_key: str | None = Field(description="B2 key of the raw image the task points at.")
    reasons: list[FlagReason]


class VerificationCounts(ResponseModel):
    """What B2 and Label Studio each hold for one project, side by side."""

    raw_objects: int
    tasks: int
    tasks_with_prelabels: int
    tasks_with_annotations: int
    annotation_objects: int
    boxes: int = Field(description="Bounding boxes across the latest annotation of every task.")


class ReleaseCheck(ResponseModel):
    """One assertion made while re-verifying a stored release."""

    name: str
    ok: bool
    detail: str


class VerificationReport(ResponseModel):
    """Live diff of raw objects, tasks, pre-labels, annotations (and a release's files)."""

    project: str
    release: str | None = Field(default=None, description="Set when a stored release was re-verified.")
    status: Literal["complete", "incomplete"]
    prelabel_run_id: str | None = Field(description="The run the pre-label check used (the latest).")
    counts: VerificationCounts
    flagged: list[FlaggedTask]
    checks: list[ReleaseCheck] = Field(
        default_factory=list, description="Release re-verification checks; empty for a live project check."
    )
