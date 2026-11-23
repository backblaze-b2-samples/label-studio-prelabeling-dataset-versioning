"""Project descriptors on B2, and the views every other service shares.

`labeling/projects/<slug>.json` is the project's system of record — there is
no database. Label Studio holds the tasks and annotations; B2 holds this
descriptor, the raw images, every pre-label run, every annotation object and
every release.
"""

from datetime import UTC, datetime

from app.config import settings
from app.repo import b2_objects
from app.service import keys
from app.service.deps import upstream
from app.service.errors import InvalidRequestError, NotFoundError
from app.types import LabelingProject, ProjectDescriptor


def _valid_slug(slug: str) -> str:
    try:
        return keys.validate_project_slug(slug)
    except keys.KeyLayoutError as e:
        raise InvalidRequestError(str(e)) from None


def load(slug: str) -> ProjectDescriptor:
    _valid_slug(slug)
    with upstream():
        data = b2_objects.get_json(keys.descriptor_key(slug))
    if data is None:
        raise NotFoundError(f"Project '{slug}' not found")
    return ProjectDescriptor.model_validate(data)


def exists(slug: str) -> bool:
    with upstream():
        return b2_objects.head(keys.descriptor_key(slug)) is not None


def save(descriptor: ProjectDescriptor) -> None:
    descriptor.updated_at = datetime.now(UTC)
    with upstream():
        b2_objects.put_json(keys.descriptor_key(descriptor.slug), descriptor.model_dump(mode="json"))


def list_all() -> list[ProjectDescriptor]:
    with upstream():
        objects = b2_objects.list_prefix(keys.projects_prefix())
        found = [b2_objects.get_json(obj["key"]) for obj in objects if obj["key"].endswith(".json")]
    descriptors = [ProjectDescriptor.model_validate(d) for d in found if d]
    return sorted(descriptors, key=lambda d: d.created_at, reverse=True)


def label_studio_link(descriptor: ProjectDescriptor) -> str:
    return f"{settings.label_studio_url.rstrip('/')}/projects/{descriptor.label_studio_project_id}/data"


def to_public(descriptor: ProjectDescriptor) -> LabelingProject:
    return LabelingProject(
        slug=descriptor.slug,
        title=descriptor.title,
        description=descriptor.description,
        labels=descriptor.labels,
        threshold=descriptor.threshold,
        model_id=descriptor.model_id,
        label_studio_project_id=descriptor.label_studio_project_id,
        label_studio_url=label_studio_link(descriptor),
        source_prefix=keys.raw_prefix(descriptor.slug),
        target_prefix=keys.annotations_prefix(descriptor.slug),
        created_at=descriptor.created_at,
        updated_at=descriptor.updated_at,
    )


def raw_images(slug: str) -> list[dict]:
    """Raw objects Label Studio's source storage will turn into tasks."""
    with upstream():
        objects = b2_objects.list_prefix(keys.raw_prefix(slug))
    return [obj for obj in objects if keys.is_image_key(obj["key"])]


def task_source_key(task: dict) -> str | None:
    """The B2 key a Label Studio task's image points at (`s3://bucket/key`)."""
    return keys.source_key_from_uri(task.get("data", {}).get("image"), settings.b2_bucket_name)
