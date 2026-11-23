"""End-to-end annotation loop against Docker Compose and a real B2 test bucket.

Opt-in: `pnpm test:live:loop` (sets RUN_LIVE_LOOP_TESTS=1). Needs
`docker compose up -d` (Label Studio + ML backend) and a filled-in `.env`.
Runs the API in-process; Label Studio and the ML backend are real.

Flow: create a run-unique project -> seed 4 CC0 images -> sync -> pre-label ->
annotate all but one task -> the release is refused with exactly that task
flagged -> annotate it -> sync annotations -> cut the release -> re-verify it
from B2 -> a second cut of the same name is refused. Cleans up with
purge_b2=true. The measured counts are written to
.data/live-loop-evidence.json for the README's evidence table.
"""

import json
import os
import sys
import uuid
from pathlib import Path

import pytest

API_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = API_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

LABELS = ["person", "bicycle", "car", "bus"]


@pytest.fixture
def api():
    if os.environ.get("RUN_LIVE_LOOP_TESTS") != "1":
        pytest.skip("set RUN_LIVE_LOOP_TESTS=1 (pnpm test:live:loop) to run against real services")
    from fastapi.testclient import TestClient

    from main import app

    with TestClient(app) as client:
        yield client


def _ok(response, status=200):
    assert response.status_code == status, f"{response.request.method} {response.request.url}: {response.text}"
    return response.json()


@pytest.mark.live
def test_annotation_loop(api):
    from annotate_from_prelabels import annotate

    from app.repo import b2_objects
    from app.service import keys
    from app.service.seed import seed_project

    slug = f"live-loop-{uuid.uuid4().hex[:8]}"
    evidence: dict = {"project": slug}
    _ok(api.post("/projects", json={
        "title": slug, "labels": LABELS, "threshold": 0.5, "seed_sample_images": False,
    }), 201)
    try:
        seeded = seed_project(slug, limit=4)
        assert len(seeded) == 4

        sync = _ok(api.post(f"/projects/{slug}/sync"))
        assert sync["raw_objects"] == 4 and sync["tasks_after"] == 4 and sync["in_sync"], sync
        evidence["sync"] = sync

        run = _ok(api.post(f"/projects/{slug}/prelabel-runs", json={}))
        assert run["tasks"] == 4
        records = [
            o for o in b2_objects.list_prefix(keys.prelabels_prefix(slug, run["run_id"]))
            if not o["key"].endswith(keys.RUN_RECORD)
        ]
        assert len(records) == 4, "one pre-label object per task"
        evidence["prelabel_run"] = {k: run[k] for k in ("run_id", "tasks", "boxes", "device", "duration_seconds")}

        first = annotate(slug, skip_last=True)
        assert len(first["annotated_task_ids"]) == 3
        _ok(api.post(f"/projects/{slug}/annotations/sync"))
        blocked = api.post(f"/projects/{slug}/releases", json={"name": "v1"})
        assert blocked.status_code == 409, blocked.text
        flagged = blocked.json()["flagged"]
        assert len(flagged) == 1 and flagged[0]["reasons"] == ["missing_annotation"], flagged
        evidence["blocked_release_flagged"] = flagged

        annotate(slug, only_last=True)
        ann_sync = _ok(api.post(f"/projects/{slug}/annotations/sync"))
        assert ann_sync["annotated_tasks"] == 4 and ann_sync["annotation_objects"] >= 4, ann_sync
        report = _ok(api.get(f"/projects/{slug}/verification"))
        assert report["status"] == "complete", report

        release = _ok(api.post(f"/projects/{slug}/releases", json={"name": "v1", "notes": "live loop"}), 201)
        manifest = release["manifest"]
        rows = manifest["tasks"]
        assert len(rows) == 4 and all(r["prelabel_key"] and r["annotation_key"] for r in rows)
        coco = json.loads(b2_objects.get_bytes(keys.release_file_key(slug, "v1", keys.COCO_FILE)))
        assert {img["id"] for img in coco["images"]} == {r["task_id"] for r in rows}
        assert len(coco["annotations"]) == sum(r["annotation_boxes"] for r in rows)
        assert manifest["totals"]["corrected"] >= 1 and manifest["totals"]["added"] >= 1

        verified = _ok(api.post(f"/projects/{slug}/releases/v1/verify"))
        assert verified["status"] == "complete", verified
        assert all(check["ok"] for check in verified["checks"]), verified["checks"]
        for row in manifest["files"]:
            head = b2_objects.head(row["key"])
            assert head is not None and head["size"] == row["bytes"]

        again = api.post(f"/projects/{slug}/releases", json={"name": "v1"})
        assert again.status_code == 409, "a committed release is immutable"

        evidence["release"] = {
            "images": len(coco["images"]),
            "coco_annotations": len(coco["annotations"]),
            "totals": manifest["totals"],
            "files": [{"key": f["key"], "bytes": f["bytes"]} for f in manifest["files"]],
            "label_studio_version": manifest["label_studio_version"],
            "checks": [{"name": c["name"], "ok": c["ok"]} for c in verified["checks"]],
        }
    finally:
        deleted = api.delete(f"/projects/{slug}", params={"purge_b2": "true"})
        evidence["cleanup"] = deleted.json() if deleted.status_code == 200 else deleted.text
        out = API_ROOT.parents[1] / ".data" / "live-loop-evidence.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(evidence, indent=2, default=str), encoding="utf-8")
