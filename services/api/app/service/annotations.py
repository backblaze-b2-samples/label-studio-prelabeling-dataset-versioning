"""Annotation objects Label Studio's target storage writes to B2.

Label Studio 1.23.2 (default flags) writes ONE object PER ANNOTATION at
`<target prefix>/<annotation id>` — no extension — whose body is the
annotation with its task nested under `task`. With
`FUTURE_SAVE_TASK_TO_STORAGE=true` it writes one object per task instead
(`<task id>.json`, body = task with an `annotations` list). Both shapes are
parsed, so verification keeps working if an operator flips that flag.
"""

from app.repo import b2_objects
from app.service import descriptors, keys
from app.service.deps import label_studio, upstream
from app.service.errors import ConflictError
from app.types import AnnotationSyncResult


def parse_object(key: str, data: dict) -> list[dict]:
    """Normalize one target-storage object into annotation entries."""
    if isinstance(data.get("annotations"), list):  # per-task format
        task_id = int(data["id"])
        source = data.get("data", {})
        return [_entry(key, task_id, source, ann) for ann in data["annotations"]]
    task = data.get("task")
    task_id = int(task["id"]) if isinstance(task, dict) else int(task)
    source = task.get("data", {}) if isinstance(task, dict) else {}
    return [_entry(key, task_id, source, data)]


def _entry(key: str, task_id: int, source: dict, ann: dict) -> dict:
    return {
        "key": key,
        "task_id": task_id,
        "annotation_id": int(ann.get("id") or 0),
        "result": ann.get("result") or [],
        "cancelled": bool(ann.get("was_cancelled")),
        "parent_prediction": ann.get("parent_prediction"),
        "image_uri": source.get("image"),
    }


def load(slug: str) -> tuple[dict[int, dict], int]:
    """(latest non-cancelled annotation per task id, annotation object count)."""
    with upstream():
        objects = b2_objects.list_prefix(keys.annotations_prefix(slug))
        bodies = [(obj["key"], b2_objects.get_json(obj["key"])) for obj in objects]
    latest: dict[int, dict] = {}
    for key, body in bodies:
        if not isinstance(body, dict):
            continue
        for entry in parse_object(key, body):
            if entry["cancelled"]:
                continue
            current = latest.get(entry["task_id"])
            if current is None or entry["annotation_id"] > current["annotation_id"]:
                latest[entry["task_id"]] = entry
    return latest, len(objects)


def sync(slug: str) -> AnnotationSyncResult:
    """Push every annotation through Label Studio's target storage, then count."""
    descriptor = descriptors.load(slug)
    with upstream():
        ls = label_studio()
        ls.sync_export_storage(descriptor.export_storage_id)
        tasks = ls.list_tasks(descriptor.label_studio_project_id)
    if not tasks:
        raise ConflictError("This project has no tasks yet. Sync from B2 first.")
    _, object_count = load(slug)
    annotated = sum(1 for t in tasks if int(t.get("total_annotations") or 0) > 0)
    return AnnotationSyncResult(annotation_objects=object_count, annotated_tasks=annotated)
