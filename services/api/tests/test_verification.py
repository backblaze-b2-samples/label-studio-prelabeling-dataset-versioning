"""Verification diff: complete, and each flag reason (service/verification.py)."""

from app.config import settings
from app.service import verification


def _task(tid, key, annotations=0):
    return {"id": tid, "data": {"image": f"s3://{settings.b2_bucket_name}/{key}"}, "total_annotations": annotations}


def test_complete(loop):
    tasks = [_task(1, "labeling/raw/p/a.jpg", 1)]
    counts, flagged = verification.diff(tasks, {"labeling/raw/p/a.jpg"}, {1: {}}, {1: {"result": []}}, 1)
    assert flagged == []
    assert counts.tasks == counts.tasks_with_prelabels == counts.tasks_with_annotations == 1


def test_each_reason(loop):
    tasks = [
        _task(1, "labeling/raw/p/a.jpg"),      # no annotation anywhere
        _task(2, "labeling/raw/p/b.jpg", 1),   # annotated in LS, not on B2 yet
        _task(3, "labeling/raw/p/gone.jpg"),   # source object deleted
    ]
    raw = {"labeling/raw/p/a.jpg", "labeling/raw/p/b.jpg", "labeling/raw/p/new.jpg"}
    records = {1: {}, 2: {}}
    annotations = {3: {"result": []}}
    counts, flagged = verification.diff(tasks, raw, records, annotations, 1)
    by_task = {f.task_id: f.reasons for f in flagged}
    assert by_task[1] == ["missing_annotation"]
    assert by_task[2] == ["missing_in_export"]
    assert by_task[3] == ["missing_source_object", "missing_prelabel"]
    assert by_task[None] == ["missing_task"]
    assert counts.raw_objects == 3 and counts.tasks == 3


def test_report_incomplete_without_tasks(loop):
    from datetime import UTC, datetime

    from app.service import descriptors
    from app.types import ProjectDescriptor

    now = datetime.now(UTC)
    descriptors.save(ProjectDescriptor(
        slug="empty", title="Empty", labels=["person"], threshold=0.5, model_id="m", model_revision="r",
        label_studio_project_id=loop.ls.create_project("Empty", "", "<View/>"), export_storage_id=1,
        created_at=now, updated_at=now,
    ))
    report = verification.report("empty")
    assert report.status == "incomplete" and report.counts.tasks == 0
