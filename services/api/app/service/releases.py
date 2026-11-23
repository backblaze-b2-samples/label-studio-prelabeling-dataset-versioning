"""Immutable dataset releases under `labeling/exports/<project>/<release>/`.

A release is built from the annotation objects on B2 (not from Label Studio),
cross-checked against Label Studio's own JSON export, and committed by writing
`manifest.json` LAST. A release whose manifest exists is never rewritten: a
second cut with the same name is a 409, and so is any cut while verification
still flags a task.
"""

import hashlib
import logging
from collections import Counter
from datetime import UTC, datetime

from app.repo import b2_objects
from app.service import coco, keys, verification
from app.service.deps import label_studio, upstream
from app.service.errors import ConflictError, InvalidRequestError, NotFoundError
from app.types import (
    DatasetRelease,
    ManifestFileRow,
    ManifestTaskRow,
    ManifestTotals,
    ReleaseCreate,
    ReleaseManifest,
)

logger = logging.getLogger(__name__)


def _manifest_key(slug: str, release: str) -> str:
    return keys.release_file_key(slug, release, keys.MANIFEST_FILE)


def _summary(manifest: ReleaseManifest, include_manifest: bool) -> DatasetRelease:
    return DatasetRelease(
        project=manifest.project,
        release=manifest.release,
        prefix=keys.exports_prefix(manifest.project, manifest.release),
        created_at=manifest.created_at,
        notes=manifest.notes,
        images=manifest.totals.images,
        annotations=manifest.totals.annotations,
        prelabel_run_id=manifest.prelabel_run_id,
        manifest=manifest if include_manifest else None,
    )


def list_releases(slug: str) -> list[DatasetRelease]:
    with upstream():
        objects = b2_objects.list_prefix(keys.exports_prefix(slug))
        bodies = [b2_objects.get_json(o["key"]) for o in objects if o["key"].endswith(f"/{keys.MANIFEST_FILE}")]
    manifests = [ReleaseManifest.model_validate(b) for b in bodies if b]
    return [_summary(m, False) for m in sorted(manifests, key=lambda m: m.created_at, reverse=True)]


def load_manifest(slug: str, release: str) -> ReleaseManifest:
    _valid_name(release)
    with upstream():
        body = b2_objects.get_json(_manifest_key(slug, release))
    if body is None:
        raise NotFoundError(f"Release '{release}' not found in project '{slug}'")
    return ReleaseManifest.model_validate(body)


def get_release(slug: str, release: str) -> DatasetRelease:
    return _summary(load_manifest(slug, release), True)


def _valid_name(name: str) -> str:
    try:
        return keys.validate_release_name(name)
    except keys.KeyLayoutError as e:
        raise InvalidRequestError(str(e)) from None


def _default_name(slug: str) -> str:
    taken = {r.release for r in list_releases(slug)}
    n = len(taken) + 1
    while f"v{n}" in taken:
        n += 1
    return f"v{n}"


def export_box_counts(export: list[dict]) -> dict[int, int]:
    """Boxes in the latest non-cancelled annotation of each task in an LS export."""
    counts: dict[int, int] = {}
    for task in export:
        live = [a for a in task.get("annotations", []) if not a.get("was_cancelled")]
        latest = max(live, key=lambda a: int(a.get("id") or 0)) if live else None
        counts[int(task["id"])] = len(coco.rectangles(latest["result"])) if latest else 0
    return counts


def cut_release(slug: str, request: ReleaseCreate) -> DatasetRelease:
    name = _valid_name(request.name) if request.name else _default_name(slug)
    with upstream():
        if b2_objects.head(_manifest_key(slug, name)) is not None:
            raise ConflictError(f"Release '{name}' already exists and is immutable")
    state = verification.gather(slug)
    report = verification.report(slug, state)
    if report.status != "complete":
        raise ConflictError("Verification is incomplete; resolve the flagged tasks first", report.flagged)

    descriptor, records, latest = state["descriptor"], state["records"], state["annotations"]
    with upstream():
        ls = label_studio()
        export = ls.export_json(descriptor.label_studio_project_id)
        ls_version = ls.version()

    images, rows = [], []
    for task in sorted(state["tasks"], key=lambda t: t["id"]):
        record, entry = records[task["id"]], latest[task["id"]]
        source_key = record["source_key"]
        images.append(
            {
                "task_id": task["id"],
                "file_name": source_key,
                "width": record.get("image_width") or 0,
                "height": record.get("image_height") or 0,
                "result": entry["result"],
            }
        )
        changes = coco.compare_regions(record.get("result", []), entry["result"])
        rows.append(
            ManifestTaskRow(
                task_id=task["id"],
                source_key=source_key,
                source_etag=state["raw"].get(source_key, {}).get("etag"),
                prelabel_key=record["key"],
                annotation_key=entry["key"],
                prelabel_boxes=len(coco.rectangles(record.get("result", []))),
                annotation_boxes=len(coco.rectangles(entry["result"])),
                **changes,
            )
        )
    try:
        dataset = coco.build_coco(descriptor.labels, images, f"{descriptor.title} {name}")
    except ValueError as e:
        raise ConflictError(f"COCO build failed: {e}") from None
    _cross_check(dataset, export, rows)

    created = datetime.now(UTC)
    files: list[ManifestFileRow] = []
    with upstream():
        for filename, payload in ((keys.COCO_FILE, dataset), (keys.LS_EXPORT_FILE, export)):
            key = keys.release_file_key(slug, name, filename)
            body = b2_objects.put_json(key, payload)
            files.append(ManifestFileRow(key=key, bytes=len(body), sha256=hashlib.sha256(body).hexdigest()))
        totals = Counter()
        for row in rows:
            totals.update({k: getattr(row, k) for k in ("accepted", "corrected", "added", "removed")})
        manifest = ReleaseManifest(
            release=name,
            project=slug,
            created_at=created,
            notes=request.notes,
            prelabel_run_id=state["run"].run_id,
            model_id=state["run"].model_id,
            model_revision=state["run"].model_revision,
            label_studio_version=ls_version,
            tasks=rows,
            files=files,
            totals=ManifestTotals(
                images=len(dataset["images"]), annotations=len(dataset["annotations"]), **totals
            ),
        )
        b2_objects.put_json(_manifest_key(slug, name), manifest.model_dump(mode="json"))
    logger.info("Release %s/%s: %d images, %d boxes", slug, name, len(rows), len(dataset["annotations"]))
    return _summary(manifest, True)


def _cross_check(dataset: dict, export: list[dict], rows: list[ManifestTaskRow]) -> None:
    """B2-built COCO and Label Studio's export must describe the same dataset."""
    ls_counts = export_box_counts(export)
    ours = {row.task_id: row.annotation_boxes for row in rows}
    if set(ls_counts) != set(ours):
        raise ConflictError(
            f"Cross-check failed: Label Studio export has tasks {sorted(set(ls_counts) ^ set(ours))} "
            "that differ from the annotation objects on B2. Run 'Sync annotations' and retry."
        )
    mismatched = sorted(t for t in ours if ours[t] != ls_counts[t])
    if mismatched or len(dataset["annotations"]) != sum(ls_counts.values()):
        raise ConflictError(
            f"Cross-check failed: box counts differ for tasks {mismatched}. "
            "Run 'Sync annotations' and retry."
        )
