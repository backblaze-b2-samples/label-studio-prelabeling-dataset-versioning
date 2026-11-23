"""The annotation loop through the service layer, with the repo boundary faked.

Covers project lifecycle, sync, pre-label record shape, release refusal while
incomplete, release immutability (409), release re-verification and purge.
"""

import json
import sys
from pathlib import Path

import pytest

from app.service import (
    annotations,
    descriptors,
    keys,
    prelabels,
    projects,
    release_checks,
    releases,
)
from app.service.errors import ConflictError, InvalidRequestError, NotFoundError
from app.types import ProjectCreate, ProjectUpdate, ReleaseCreate

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from annotate_from_prelabels import annotate


def _create(loop, seed=True, title="Street scenes, batch 1"):
    return projects.create_project(
        ProjectCreate(title=title, labels=["bus", "person"], threshold=0.5, seed_sample_images=seed)
    )


def test_create_wires_label_studio_to_b2(loop):
    project = _create(loop)
    assert project.slug == "street-scenes-batch-1"
    assert project.labels == ["person", "bus"]  # model order, not request order
    assert project.source_prefix == "labeling/raw/street-scenes-batch-1/"
    descriptor = descriptors.load(project.slug)
    kinds = {s["kind"]: s["prefix"] for s in loop.ls.storages.values()}
    assert kinds == {"export": "labeling/annotations/street-scenes-batch-1",
                     "import": "labeling/raw/street-scenes-batch-1"}
    assert descriptor.import_storage_id is not None
    # registering the ML backend must not switch on live predictions
    assert loop.ls.projects[descriptor.label_studio_project_id]["model_version"] == ""
    with pytest.raises(ConflictError):
        _create(loop)


def test_create_rejects_unknown_labels(loop):
    with pytest.raises(InvalidRequestError):
        projects.create_project(ProjectCreate(title="Bad labels", labels=["unicorn"]))


def test_source_storage_deferred_until_images_exist(loop):
    project = _create(loop, seed=False, title="Empty batch")
    assert descriptors.load(project.slug).import_storage_id is None
    with pytest.raises(ConflictError):
        projects.sync_project(project.slug)
    loop.seed(project.slug, 2)
    result = projects.sync_project(project.slug)
    assert (result.raw_objects, result.tasks_before, result.tasks_after, result.in_sync) == (2, 0, 2, True)


def test_edit_and_lifecycle(loop):
    project = _create(loop)
    updated = projects.update_project(project.slug, ProjectUpdate(title="Renamed", threshold=0.7))
    assert updated.title == "Renamed" and updated.threshold == 0.7 and updated.labels == project.labels
    assert [p.slug for p in projects.list_projects()] == [project.slug]
    with pytest.raises(NotFoundError):
        projects.get_detail("missing-project")


def test_full_loop(loop):
    slug = _create(loop).slug
    assert projects.sync_project(slug).tasks_after == 3

    run = prelabels.run(slug)
    assert (run.tasks, run.boxes, run.model_id) == (3, 3, "PekingU/rtdetr_r18vd_coco_o365")
    record_keys = [k for k in loop.b2.objects if k.startswith(run.prefix) and not k.endswith("_run.json")]
    assert len(record_keys) == 3
    record = json.loads(loop.b2.objects[record_keys[0]])
    assert {"task_id", "source_key", "source_etag", "model_id", "model_revision", "threshold",
            "label_studio_prediction_id", "result", "image_width"} <= set(record)
    assert record["source_etag"] and record["source_key"].startswith("labeling/raw/")
    descriptor = descriptors.load(slug)
    assert loop.ls.projects[descriptor.label_studio_project_id]["model_version"] == run.run_id

    annotate(slug, skip_last=True)
    annotations.sync(slug)
    with pytest.raises(ConflictError) as blocked:
        releases.cut_release(slug, ReleaseCreate())
    assert [(f.task_id is not None, f.reasons) for f in blocked.value.flagged] == [(True, ["missing_annotation"])]

    annotate(slug, only_last=True)
    synced = annotations.sync(slug)
    assert synced.annotation_objects == 3 and synced.annotated_tasks == 3

    release = releases.cut_release(slug, ReleaseCreate(notes="first"))
    assert release.release == "v1" and release.images == 3
    totals = release.manifest.totals
    assert totals.annotations == 4  # 3 accepted/corrected + 1 added
    assert (totals.corrected, totals.added) == (2, 1)  # tasks 0 and 2 nudged
    manifest_key = keys.release_file_key(slug, "v1", keys.MANIFEST_FILE)
    assert manifest_key in loop.b2.objects
    coco = json.loads(loop.b2.objects[keys.release_file_key(slug, "v1", keys.COCO_FILE)])
    assert len(coco["annotations"]) == sum(r.annotation_boxes for r in release.manifest.tasks)

    with pytest.raises(ConflictError, match="immutable"):
        releases.cut_release(slug, ReleaseCreate(name="v1"))
    assert releases.cut_release(slug, ReleaseCreate()).release == "v2"

    report = release_checks.verify_release(slug, "v1")
    assert report.status == "complete" and all(c.ok for c in report.checks)
    loop.b2.objects[keys.release_file_key(slug, "v1", keys.COCO_FILE)] += b" "
    assert release_checks.verify_release(slug, "v1").status == "incomplete"

    detail = projects.get_detail(slug)
    assert detail.counts.releases == 2 and detail.latest_run.run_id == run.run_id

    deleted = projects.delete_project(slug, purge_b2=True)
    assert deleted.label_studio_project_deleted and deleted.b2_objects_deleted > 0
    assert not [k for k in loop.b2.objects if f"/{slug}/" in k or k.endswith(f"/{slug}.json")]


def test_cross_check_mismatch_blocks_release(loop, monkeypatch):
    slug = _create(loop).slug
    projects.sync_project(slug)
    prelabels.run(slug)
    annotate(slug)
    annotations.sync(slug)
    real_export = loop.ls.export_json
    monkeypatch.setattr(loop.ls, "export_json", lambda pid: [
        {**t, "annotations": [{**a, "result": []} for a in t["annotations"]]} for t in real_export(pid)
    ])
    with pytest.raises(ConflictError, match="Cross-check failed"):
        releases.cut_release(slug, ReleaseCreate())
    assert not any(k.endswith("manifest.json") for k in loop.b2.objects)


def test_delete_without_purge_keeps_b2_data(loop):
    slug = _create(loop).slug
    result = projects.delete_project(slug, purge_b2=False)
    assert result.b2_objects_deleted == 0
    assert any(k.startswith(f"labeling/raw/{slug}/") for k in loop.b2.objects)
