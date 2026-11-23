from datetime import datetime

from pydantic import BaseModel, Field

from app.types.base import ResponseModel
from app.types.prelabels import PrelabelRun
from app.types.releases import DatasetRelease


class ProjectDescriptor(BaseModel):
    """`labeling/projects/<slug>.json` — the project's own record on B2.

    Internal: the API returns `LabelingProject`, which derives URLs and prefixes
    from this and hides the Label Studio bookkeeping ids.
    """

    slug: str
    title: str
    description: str = ""
    labels: list[str]
    threshold: float
    model_id: str
    model_revision: str
    label_studio_project_id: int
    import_storage_id: int | None = None
    export_storage_id: int
    ml_backend_id: int | None = None
    created_at: datetime
    updated_at: datetime


class LabelingProject(ResponseModel):
    """A Label Studio project bound to one raw-image prefix on B2."""

    slug: str
    title: str
    description: str
    labels: list[str]
    threshold: float
    model_id: str
    label_studio_project_id: int
    label_studio_url: str = Field(description="Deep link that opens the project in Label Studio.")
    source_prefix: str = Field(description="Label Studio source storage prefix (raw images).")
    target_prefix: str = Field(description="Label Studio target storage prefix (annotations).")
    created_at: datetime
    updated_at: datetime


class ProjectCreate(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=500)
    labels: list[str] = Field(min_length=1, max_length=80)
    threshold: float = Field(default=0.5, ge=0.05, le=0.95)
    seed_sample_images: bool = Field(
        default=True, description="Copy the 8 pinned CC0 sample images into the raw prefix."
    )


class ProjectUpdate(BaseModel):
    """Labels are deliberately absent: they are fixed after creation."""

    title: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    threshold: float | None = Field(default=None, ge=0.05, le=0.95)


class ProjectCounts(ResponseModel):
    raw_objects: int
    tasks: int
    annotated_tasks: int
    prelabel_runs: int
    releases: int


class ProjectDetail(ResponseModel):
    project: LabelingProject
    counts: ProjectCounts
    latest_run: PrelabelRun | None
    latest_release: DatasetRelease | None


class ProjectDeleted(ResponseModel):
    slug: str
    label_studio_project_deleted: bool
    b2_objects_deleted: int = Field(description="Objects removed from B2 (0 unless purge_b2=true).")


class SyncResult(ResponseModel):
    raw_objects: int = Field(description="Raw images under the source prefix that match the image filter.")
    tasks_before: int
    tasks_after: int
    in_sync: bool = Field(description="True when tasks_after equals raw_objects.")


class AnnotationSyncResult(ResponseModel):
    annotation_objects: int = Field(description="Annotation objects under the target prefix after the sync.")
    annotated_tasks: int = Field(description="Tasks Label Studio reports as annotated.")


class ModelInfo(ResponseModel):
    """The local detector the ML backend serves."""

    id: str
    name: str
    license: str
    source_url: str
    revision: str
    device: str
    labels: list[str]
