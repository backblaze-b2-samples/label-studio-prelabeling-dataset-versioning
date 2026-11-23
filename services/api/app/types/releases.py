from datetime import datetime

from pydantic import BaseModel, Field

from app.types.base import ResponseModel
from app.types.verification import FlaggedTask


class ReleaseCreate(BaseModel):
    """Cut an immutable release. Omit `name` to get `v<N+1>`."""

    name: str | None = Field(default=None, max_length=64, description="Release name, e.g. v1.")
    notes: str | None = Field(default=None, max_length=500)


class ManifestTaskRow(ResponseModel):
    """One task as it went into the release."""

    task_id: int
    source_key: str
    source_etag: str | None
    prelabel_key: str | None
    annotation_key: str
    prelabel_boxes: int
    annotation_boxes: int
    accepted: int = Field(description="Suggested boxes kept unchanged.")
    corrected: int = Field(description="Suggested boxes kept but moved, resized or relabelled.")
    added: int = Field(description="Boxes drawn that the model did not suggest.")
    removed: int = Field(description="Suggested boxes the annotator deleted.")


class ManifestFileRow(ResponseModel):
    """One file written under the release prefix, with its integrity data."""

    key: str
    bytes: int
    sha256: str


class ManifestTotals(ResponseModel):
    images: int
    annotations: int = Field(description="COCO annotation (box) count.")
    accepted: int
    corrected: int
    added: int
    removed: int


class ReleaseManifest(ResponseModel):
    """`manifest.json`: written last, so its presence is what commits a release."""

    release: str
    project: str
    created_at: datetime
    notes: str | None
    prelabel_run_id: str | None
    model_id: str
    model_revision: str
    label_studio_version: str
    tasks: list[ManifestTaskRow]
    files: list[ManifestFileRow]
    totals: ManifestTotals


class DatasetRelease(ResponseModel):
    """A committed release under `labeling/exports/<project>/<release>/`."""

    project: str
    release: str
    prefix: str
    created_at: datetime
    notes: str | None
    images: int
    annotations: int
    prelabel_run_id: str | None
    manifest: ReleaseManifest | None = Field(
        default=None, description="Included on create and on the single-release route."
    )


class ReleaseBlocked(ResponseModel):
    """409 body: the release already exists, or verification found gaps."""

    detail: str
    flagged: list[FlaggedTask]
