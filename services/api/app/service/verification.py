"""Live verification: does B2 hold a pre-label and an annotation for every task?

`diff()` is pure and unit-tested; `report()` gathers its inputs from B2 and
Label Studio and writes nothing. A project is `complete` only when there is at
least one task and nothing is flagged — that is the gate a release must pass.
"""

from app.service import annotations, coco, descriptors, prelabels
from app.service.deps import label_studio, upstream
from app.types import FlaggedTask, VerificationCounts, VerificationReport


def diff(
    tasks: list[dict],
    raw_keys: set[str],
    records: dict[int, dict],
    latest_annotations: dict[int, dict],
    annotation_objects: int,
) -> tuple[VerificationCounts, list[FlaggedTask]]:
    flagged: list[FlaggedTask] = []
    task_keys: set[str] = set()
    for task in sorted(tasks, key=lambda t: t["id"]):
        source_key = descriptors.task_source_key(task)
        if source_key:
            task_keys.add(source_key)
        reasons = []
        if not source_key or source_key not in raw_keys:
            reasons.append("missing_source_object")
        if task["id"] not in records:
            reasons.append("missing_prelabel")
        if task["id"] not in latest_annotations:
            # Annotated in Label Studio but nothing on B2 means the target
            # storage has not written it yet: run "Sync annotations".
            in_ls = int(task.get("total_annotations") or 0) > 0
            reasons.append("missing_in_export" if in_ls else "missing_annotation")
        if reasons:
            flagged.append(FlaggedTask(task_id=task["id"], source_key=source_key, reasons=reasons))
    for key in sorted(raw_keys - task_keys):
        flagged.append(FlaggedTask(task_id=None, source_key=key, reasons=["missing_task"]))

    task_ids = {t["id"] for t in tasks}
    counts = VerificationCounts(
        raw_objects=len(raw_keys),
        tasks=len(tasks),
        tasks_with_prelabels=len(task_ids & set(records)),
        tasks_with_annotations=len(task_ids & set(latest_annotations)),
        annotation_objects=annotation_objects,
        boxes=sum(
            len(coco.rectangles(entry["result"]))
            for task_id, entry in latest_annotations.items()
            if task_id in task_ids
        ),
    )
    return counts, flagged


def gather(slug: str) -> dict:
    """Everything a verification or a release needs, read once."""
    descriptor = descriptors.load(slug)
    with upstream():
        tasks = label_studio().list_tasks(descriptor.label_studio_project_id)
    runs = prelabels.list_runs(slug)
    run_id = runs[0].run_id if runs else None
    records = prelabels.load_records(slug, run_id) if run_id else {}
    latest, object_count = annotations.load(slug)
    raw = descriptors.raw_images(slug)
    return {
        "descriptor": descriptor,
        "tasks": tasks,
        "run": runs[0] if runs else None,
        "records": records,
        "annotations": latest,
        "annotation_objects": object_count,
        "raw": {obj["key"]: obj for obj in raw},
    }


def report(slug: str, state: dict | None = None) -> VerificationReport:
    state = state or gather(slug)
    counts, flagged = diff(
        state["tasks"], set(state["raw"]), state["records"], state["annotations"], state["annotation_objects"]
    )
    complete = counts.tasks > 0 and not flagged
    return VerificationReport(
        project=slug,
        status="complete" if complete else "incomplete",
        prelabel_run_id=state["run"].run_id if state["run"] else None,
        counts=counts,
        flagged=flagged,
    )
