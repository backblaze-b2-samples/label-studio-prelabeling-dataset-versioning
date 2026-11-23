"""Re-verify a stored release from B2 alone.

Reads `manifest.json`, then checks every file it lists (size AND sha256),
every object a task row points at, and that the stored COCO file and the stored
Label Studio export still agree with the manifest. Writes nothing.
"""

import hashlib
import json

from app.repo import b2_objects
from app.service import keys
from app.service.deps import upstream
from app.service.releases import export_box_counts, load_manifest
from app.types import FlaggedTask, ReleaseCheck, VerificationCounts, VerificationReport


def verify_release(slug: str, release: str) -> VerificationReport:
    manifest = load_manifest(slug, release)
    checks: list[ReleaseCheck] = []
    bodies: dict[str, bytes | None] = {}
    with upstream():
        for row in manifest.files:
            body = b2_objects.get_bytes(row.key)
            bodies[row.key] = body
            if body is None:
                checks.append(ReleaseCheck(name=f"file {row.key}", ok=False, detail="missing from B2"))
                continue
            digest = hashlib.sha256(body).hexdigest()
            ok = len(body) == row.bytes and digest == row.sha256
            detail = "size and sha256 match" if ok else f"bytes {len(body)} / sha256 {digest[:12]}… differ"
            checks.append(ReleaseCheck(name=f"file {row.key}", ok=ok, detail=detail))

        flagged: list[FlaggedTask] = []
        present = {"source": 0, "prelabel": 0, "annotation": set()}
        for row in manifest.tasks:
            reasons = []
            source = b2_objects.head(row.source_key)
            if source is None or (row.source_etag and source["etag"] != row.source_etag):
                reasons.append("missing_source_object")
            else:
                present["source"] += 1
            if row.prelabel_key and b2_objects.head(row.prelabel_key) is None:
                reasons.append("missing_prelabel")
            else:
                present["prelabel"] += 1
            if b2_objects.head(row.annotation_key) is None:
                reasons.append("missing_annotation")
            else:
                present["annotation"].add(row.annotation_key)
            if reasons:
                flagged.append(FlaggedTask(task_id=row.task_id, source_key=row.source_key, reasons=reasons))

    coco_body = bodies.get(keys.release_file_key(slug, release, keys.COCO_FILE))
    export_body = bodies.get(keys.release_file_key(slug, release, keys.LS_EXPORT_FILE))
    task_ids = {row.task_id for row in manifest.tasks}
    boxes = manifest.totals.annotations
    if coco_body is not None:
        dataset = json.loads(coco_body)
        image_ids = {img["id"] for img in dataset.get("images", [])}
        boxes = len(dataset.get("annotations", []))
        checks.append(_check("COCO images = manifest tasks", image_ids == task_ids, f"{len(image_ids)} images"))
        checks.append(
            _check(
                "COCO boxes = manifest total",
                boxes == manifest.totals.annotations == sum(r.annotation_boxes for r in manifest.tasks),
                f"{boxes} boxes",
            )
        )
    if export_body is not None:
        ls_counts = export_box_counts(json.loads(export_body))
        missing = task_ids - set(ls_counts)
        for row in manifest.tasks:
            if row.task_id in missing:
                flagged.append(FlaggedTask(task_id=row.task_id, source_key=row.source_key, reasons=["missing_in_export"]))
        agree = not missing and all(ls_counts[r.task_id] == r.annotation_boxes for r in manifest.tasks)
        checks.append(_check("Label Studio export agrees with COCO", agree, f"{len(ls_counts)} tasks in export"))
    checks.append(_check("every task object present on B2", not flagged, f"{len(flagged)} task(s) flagged"))

    complete = all(c.ok for c in checks) and not flagged
    return VerificationReport(
        project=slug,
        release=release,
        status="complete" if complete else "incomplete",
        prelabel_run_id=manifest.prelabel_run_id,
        counts=VerificationCounts(
            raw_objects=present["source"],
            tasks=len(manifest.tasks),
            tasks_with_prelabels=present["prelabel"],
            tasks_with_annotations=len(present["annotation"]),
            annotation_objects=len(present["annotation"]),
            boxes=boxes,
        ),
        flagged=flagged,
        checks=checks,
    )


def _check(name: str, ok: bool, detail: str) -> ReleaseCheck:
    return ReleaseCheck(name=name, ok=ok, detail=detail)
