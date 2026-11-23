"""Labeling project lifecycle: create, read, edit, delete, sync.

Creating a project wires Label Studio to B2 with its own storages — source
storage on `labeling/raw/<slug>/`, target storage on
`labeling/annotations/<slug>/` — and registers the ML backend. No proxy sits
between Label Studio and B2: Label Studio's S3 client talks to the B2 S3
endpoint directly with the credentials configured here.
"""

import logging
from datetime import UTC, datetime

from app.config import settings
from app.repo import b2_objects
from app.service import descriptors, keys, prelabels, releases, seed
from app.service.deps import label_studio, ml_backend, upstream
from app.service.errors import ConflictError, InvalidRequestError
from app.service.label_config import build_label_config
from app.types import (
    LabelingProject,
    ModelInfo,
    ProjectCounts,
    ProjectCreate,
    ProjectDeleted,
    ProjectDescriptor,
    ProjectDetail,
    ProjectUpdate,
    SyncResult,
)

logger = logging.getLogger(__name__)


def model_info() -> ModelInfo:
    with upstream():
        return ModelInfo.model_validate(ml_backend().info())


def list_projects() -> list[LabelingProject]:
    return [descriptors.to_public(d) for d in descriptors.list_all()]


def create_project(request: ProjectCreate) -> LabelingProject:
    try:
        slug = keys.slugify(request.title)
    except keys.KeyLayoutError as e:
        raise InvalidRequestError(f"Title gives an unusable slug: {e}") from None
    if descriptors.exists(slug):
        raise ConflictError(f"A project with slug '{slug}' already exists")
    info = model_info()
    unknown = sorted(set(request.labels) - set(info.labels))
    if unknown:
        raise InvalidRequestError(f"Labels not known to the model: {', '.join(unknown)}")
    labels = [label for label in info.labels if label in set(request.labels)]  # model order

    if request.seed_sample_images:
        seed.seed_project(slug)

    ls = label_studio()
    project_id: int | None = None
    try:
        with upstream():
            project_id = ls.create_project(request.title, request.description, build_label_config(labels))
            export_id = ls.create_export_storage(project_id, keys.annotations_prefix(slug))
            ml_id = _register_ml_backend(project_id)
            import_id = None
            if descriptors.raw_images(slug):
                import_id = ls.create_import_storage(
                    project_id, keys.raw_prefix(slug), keys.IMAGE_REGEX_FILTER
                )
        now = datetime.now(UTC)
        descriptor = ProjectDescriptor(
            slug=slug,
            title=request.title,
            description=request.description,
            labels=labels,
            threshold=request.threshold,
            model_id=info.id,
            model_revision=info.revision,
            label_studio_project_id=project_id,
            import_storage_id=import_id,
            export_storage_id=export_id,
            ml_backend_id=ml_id,
            created_at=now,
            updated_at=now,
        )
        descriptors.save(descriptor)
    except Exception:
        # Do not leave an orphan Label Studio project behind a failed create.
        if project_id is not None:
            try:
                ls.delete_project(project_id)
            except Exception:  # best-effort rollback
                logger.warning("Rollback could not delete Label Studio project %s", project_id)
        raise
    logger.info("Created labeling project %s (Label Studio project %s)", slug, project_id)
    return descriptors.to_public(descriptor)


def _register_ml_backend(project_id: int) -> int | None:
    """Register the ML backend so it shows under the project's model settings.

    Label Studio then sets the project's model_version to the backend, which
    would fetch live predictions whenever a task opens; that is switched back
    off, because the authoritative pre-labels come from pre-label runs.
    """
    ls = label_studio()
    ml_id = ls.register_ml_backend(project_id, settings.ml_backend_internal_url, "RT-DETR R18 (local)")
    ls.update_project(project_id, {"model_version": ""})
    return ml_id


def get_detail(slug: str) -> ProjectDetail:
    descriptor = descriptors.load(slug)
    with upstream():
        tasks = label_studio().list_tasks(descriptor.label_studio_project_id)
    runs = prelabels.list_runs(slug)
    project_releases = releases.list_releases(slug)
    counts = ProjectCounts(
        raw_objects=len(descriptors.raw_images(slug)),
        tasks=len(tasks),
        annotated_tasks=sum(1 for t in tasks if int(t.get("total_annotations") or 0) > 0),
        prelabel_runs=len(runs),
        releases=len(project_releases),
    )
    return ProjectDetail(
        project=descriptors.to_public(descriptor),
        counts=counts,
        latest_run=runs[0] if runs else None,
        latest_release=project_releases[0] if project_releases else None,
    )


def update_project(slug: str, request: ProjectUpdate) -> LabelingProject:
    descriptor = descriptors.load(slug)
    changes = request.model_dump(exclude_none=True)
    if not changes:
        return descriptors.to_public(descriptor)
    ls_fields = {k: v for k, v in changes.items() if k in ("title", "description")}
    if ls_fields:
        with upstream():
            label_studio().update_project(descriptor.label_studio_project_id, ls_fields)
    updated = descriptor.model_copy(update=changes)
    descriptors.save(updated)
    return descriptors.to_public(updated)


def delete_project(slug: str, purge_b2: bool) -> ProjectDeleted:
    descriptor = descriptors.load(slug)
    with upstream():
        ls_deleted = label_studio().delete_project(descriptor.label_studio_project_id)
        deleted = 0
        if purge_b2:
            prefixes = (
                keys.raw_prefix(slug),
                keys.prelabels_prefix(slug),
                keys.annotations_prefix(slug),
                keys.exports_prefix(slug),
            )
            doomed = [obj["key"] for p in prefixes for obj in b2_objects.list_prefix(p)]
            deleted = b2_objects.delete_keys(doomed)
        b2_objects.delete_keys([keys.descriptor_key(slug)])
    logger.info("Deleted project %s (purge_b2=%s, %d objects)", slug, purge_b2, deleted)
    return ProjectDeleted(slug=slug, label_studio_project_deleted=ls_deleted, b2_objects_deleted=deleted)


def sync_project(slug: str) -> SyncResult:
    """Run Label Studio's source-storage sync, then check tasks == raw images."""
    descriptor = descriptors.load(slug)
    raw = descriptors.raw_images(slug)
    ls = label_studio()
    with upstream():
        if descriptor.import_storage_id is None:
            if not raw:
                raise ConflictError(
                    f"No images under {keys.raw_prefix(slug)} yet. Upload or seed images first."
                )
            # Label Studio refuses a source storage whose prefix is empty, so
            # it is created on the first sync that has something to import.
            descriptor.import_storage_id = ls.create_import_storage(
                descriptor.label_studio_project_id, keys.raw_prefix(slug), keys.IMAGE_REGEX_FILTER
            )
            descriptors.save(descriptor)
        before = len(ls.list_tasks(descriptor.label_studio_project_id))
        ls.sync_import_storage(descriptor.import_storage_id)
        after = len(ls.list_tasks(descriptor.label_studio_project_id))
    return SyncResult(raw_objects=len(raw), tasks_before=before, tasks_after=after, in_sync=after == len(raw))
