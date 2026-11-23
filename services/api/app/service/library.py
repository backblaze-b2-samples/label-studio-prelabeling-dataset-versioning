"""The Dataset Library: one project's slice of `labeling/`, one kind at a time.

Read-only and paginated straight from B2 (100 keys per page). Rows link to the
bucket explorer for preview and download, so nothing here renders objects.
"""

from app.repo import b2_objects
from app.service import descriptors, keys, prelabels
from app.service.deps import label_studio, upstream
from app.service.errors import InvalidRequestError
from app.types import AssetItem, AssetKind, AssetPage

PAGE_SIZE = 100


def _prefix(slug: str, kind: AssetKind, run: str | None, release: str | None) -> str:
    try:
        if kind == "raw":
            return keys.raw_prefix(slug)
        if kind == "prelabels":
            return keys.prelabels_prefix(slug, keys.validate_run_id(run) if run else None)
        if kind == "annotations":
            return keys.annotations_prefix(slug)
        return keys.exports_prefix(slug, keys.validate_release_name(release) if release else None)
    except keys.KeyLayoutError as e:
        raise InvalidRequestError(str(e)) from None


def _raw_status(slug: str, project_id: int) -> tuple[set[str], set[str]]:
    """(source keys with a pre-label in the latest run, source keys of annotated tasks)."""
    with upstream():
        tasks = label_studio().list_tasks(project_id)
    runs = prelabels.list_runs(slug)
    labelled = set()
    if runs:
        with upstream():
            stems = {
                obj["key"].rsplit("/", 1)[-1].removesuffix(".json")
                for obj in b2_objects.list_prefix(keys.prelabels_prefix(slug, runs[0].run_id))
            }
        for task in tasks:
            source = descriptors.task_source_key(task)
            if source and (keys.image_stem(source) in stems or f"{keys.image_stem(source)}-t{task['id']}" in stems):
                labelled.add(source)
    annotated = {
        descriptors.task_source_key(t) for t in tasks if int(t.get("total_annotations") or 0) > 0
    }
    return labelled, {key for key in annotated if key}


def assets(
    slug: str, kind: AssetKind, run: str | None = None, release: str | None = None, cursor: str | None = None
) -> AssetPage:
    descriptor = descriptors.load(slug)
    prefix = _prefix(slug, kind, run, release)
    with upstream():
        objects, next_cursor = b2_objects.list_page(prefix, cursor, PAGE_SIZE)

    group_root = {"prelabels": keys.prelabels_prefix(slug), "exports": keys.exports_prefix(slug)}.get(kind)
    labelled: set[str] = set()
    annotated: set[str] = set()
    if kind == "raw":
        objects = [o for o in objects if keys.is_image_key(o["key"])]
        labelled, annotated = _raw_status(slug, descriptor.label_studio_project_id)

    items = [
        AssetItem(
            key=obj["key"],
            size_bytes=obj["size"],
            last_modified=obj["last_modified"],
            group=keys.child_name(group_root, obj["key"]) if group_root else None,
            prelabel_status=obj["key"] in labelled if kind == "raw" else None,
            annotation_status=obj["key"] in annotated if kind == "raw" else None,
        )
        for obj in objects
    ]
    groups = sorted({item.group for item in items if item.group}, reverse=True)
    return AssetPage(project=slug, kind=kind, prefix=prefix, items=items, groups=groups, next_cursor=next_cursor)
