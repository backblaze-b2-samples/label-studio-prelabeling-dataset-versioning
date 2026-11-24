"""Pre-label runs: score every task with the local detector, keep it all on B2.

A run writes one JSON per task under
`labeling/prelabels/<project>/<run-id>/<image-stem>.json` and a `_run.json`
summary, then creates the same suggestions in Label Studio as predictions with
`model_version=<run-id>`. The B2 copy is the authoritative, versioned record;
Label Studio's is what annotators see and correct.
"""

import logging
import time
from datetime import UTC, datetime

from app.config import settings
from app.repo import b2_objects, progress
from app.service import coco, descriptors, keys
from app.service.deps import label_studio, ml_backend, upstream
from app.service.errors import ConflictError
from app.service.label_config import build_label_config
from app.types import PrelabelRun, ProjectDescriptor

logger = logging.getLogger(__name__)
MODEL_SHORT = "rtdetr-r18"


def _record_stems(tasks: list[dict]) -> dict[int, str]:
    """Image stem per task id; a stem shared by two images gets `-t<task id>`."""
    seen: dict[str, int] = {}
    stems: dict[int, str] = {}
    for task in sorted(tasks, key=lambda t: t["id"]):
        stem = keys.image_stem(descriptors.task_source_key(task) or f"task-{task['id']}")
        stems[task["id"]] = f"{stem}-t{task['id']}" if stem in seen else stem
        seen[stem] = task["id"]
    return stems


def run(slug: str, threshold: float | None = None) -> PrelabelRun:
    """Score every task once. One run per project at a time (409 otherwise).

    Reports `done`/`total` tasks to `repo.progress` as it goes, so the web app
    can show "N of M" and still see the run after a reload.
    """
    descriptor = descriptors.load(slug)
    if not progress.start(progress.PRELABEL, slug, "Listing tasks in Label Studio"):
        raise ConflictError("A pre-label run is already in progress for this project.")
    try:
        return _run(slug, descriptor, threshold)
    finally:
        progress.finish(progress.PRELABEL, slug)


def _run(slug: str, descriptor: ProjectDescriptor, threshold: float | None) -> PrelabelRun:
    threshold = descriptor.threshold if threshold is None else threshold
    started = datetime.now(UTC)
    clock = time.monotonic()
    with upstream():
        ls = label_studio()
        tasks = ls.list_tasks(descriptor.label_studio_project_id)
        if not tasks:
            raise ConflictError("This project has no tasks yet. Sync from B2 first.")
        info = ml_backend().info()
        run_id = keys.new_run_id(MODEL_SHORT, started)
        label_config = build_label_config(descriptor.labels)
        stems = _record_stems(tasks)
        boxes = 0
        done = 0
        progress.update(progress.PRELABEL, slug, stage="Scoring tasks", total=len(tasks))
        size = max(1, settings.prelabel_batch_size)
        for start in range(0, len(tasks), size):
            batch = tasks[start : start + size]
            payload = [{"id": t["id"], "data": {"image": t["data"]["image"]}} for t in batch]
            predictions = ml_backend().predict(payload, label_config, threshold)
            for task, prediction in zip(batch, predictions, strict=True):
                boxes += _store_task_prediction(
                    slug, run_id, stems[task["id"]], task, prediction, info, threshold
                )
                done += 1
                progress.update(progress.PRELABEL, slug, done=done)
        progress.update(progress.PRELABEL, slug, stage="Saving the run summary")
        duration = round(time.monotonic() - clock, 2)
        summary = PrelabelRun(
            run_id=run_id,
            project=slug,
            model_id=info["id"],
            model_revision=info["revision"],
            device=info.get("device", "unknown"),
            threshold=threshold,
            tasks=len(tasks),
            boxes=boxes,
            prefix=keys.prelabels_prefix(slug, run_id),
            started_at=started,
            duration_seconds=duration,
        )
        b2_objects.put_json(keys.run_record_key(slug, run_id), summary.model_dump(mode="json"))
        # Show this run's suggestions in the labeling UI (static predictions,
        # so Label Studio never calls the model on task open).
        ls.update_project(descriptor.label_studio_project_id, {"model_version": run_id})
    logger.info("Pre-label run %s: %d tasks, %d boxes in %.1fs", run_id, len(tasks), boxes, duration)
    return summary


def _store_task_prediction(
    slug: str, run_id: str, stem: str, task: dict, prediction: dict, info: dict, threshold: float
) -> int:
    source_key = descriptors.task_source_key(task)
    source = b2_objects.head(source_key) if source_key else None
    result = prediction.get("result") or []
    score = float(prediction.get("score") or 0.0)
    prediction_id = label_studio().create_prediction(task["id"], result, score, run_id)
    record = {
        "task_id": task["id"],
        "source_key": source_key,
        "source_etag": source["etag"] if source else None,
        "run_id": run_id,
        "model_id": info["id"],
        "model_revision": info["revision"],
        "device": info.get("device"),
        "threshold": threshold,
        "image_width": prediction.get("image_width"),
        "image_height": prediction.get("image_height"),
        "label_studio_prediction_id": prediction_id,
        "score": score,
        "result": result,
        "created_at": datetime.now(UTC).isoformat(),
    }
    b2_objects.put_json(keys.prelabel_key(slug, run_id, stem), record)
    return len(coco.rectangles(result))


def list_runs(slug: str) -> list[PrelabelRun]:
    descriptors.load(slug)
    prefix = keys.prelabels_prefix(slug)
    with upstream():
        objects = b2_objects.list_prefix(prefix)
        summaries = [
            b2_objects.get_json(obj["key"]) for obj in objects if obj["key"].endswith(f"/{keys.RUN_RECORD}")
        ]
    runs = [PrelabelRun.model_validate(s) for s in summaries if s]
    return sorted(runs, key=lambda r: r.run_id, reverse=True)


def load_records(slug: str, run_id: str) -> dict[int, dict]:
    """Per-task records of one run, keyed by task id (each carries its own `key`)."""
    with upstream():
        objects = b2_objects.list_prefix(keys.prelabels_prefix(slug, run_id))
        records: dict[int, dict] = {}
        for obj in objects:
            if obj["key"].endswith(f"/{keys.RUN_RECORD}"):
                continue
            body = b2_objects.get_json(obj["key"])
            if isinstance(body, dict) and "task_id" in body:
                records[int(body["task_id"])] = {**body, "key": obj["key"]}
    return records
