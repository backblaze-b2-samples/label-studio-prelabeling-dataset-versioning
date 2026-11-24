<!-- last_verified: 2026-11-24 -->
# Feature: Dataset Releases

## Purpose
Cut an immutable, auditable COCO dataset from the annotation objects on B2, with a manifest that ties every image to its source object, pre-label and annotation.

## Used By
- UI: "Cut release" dialog; "Releases" tab (re-verify); dashboard "Recent releases"; Library "Releases"
- API: `POST /projects/{slug}/releases` (201, or 409 `ReleaseBlocked`), `GET /projects/{slug}/releases`, `GET /projects/{slug}/releases/{release}`, `POST /projects/{slug}/releases/{release}/verify`

## Core Functions
- `service/releases.py` — `cut_release`, `list_releases`, `get_release`, `export_box_counts`
- `service/release_checks.py` — `verify_release`
- `service/coco.py` — pure Label Studio -> COCO conversion and accepted/corrected/added/removed counting

## Outputs (under `labeling/exports/<slug>/<release>/`)
- `annotations.coco.json` — built from B2 annotation objects; category ids follow the project's label order; `bbox` is pixels `[x, y, w, h]` rounded to 2 decimals
- `label-studio-export.json` — Label Studio's own JSON export, for cross-checking
- `manifest.json` — written LAST: release, project, created_at, notes, pre-label run id, model id and revision, Label Studio version, one row per task (task id, source key, source ETag, pre-label key, annotation key, box counts, accepted/corrected/added/removed), one row per file (key, bytes, sha256), totals

## Flow
- Name: given (`^[a-z0-9][a-z0-9._-]{0,63}$`) or `v<N+1>`
- 409 if `manifest.json` already exists (immutability) or if live verification is incomplete (the body lists the flagged tasks)
- Build COCO, fetch Label Studio's export, cross-check (same task set, same box count per task); 409 on disagreement, nothing committed
- Write the two data files, hash them, write the manifest
- Progress: the cut registers itself in `repo/progress.py` and reports each of `RELEASE_STEPS` (the four reads of `verification.gather`, then fetch the export, build COCO and cross-check, write the data files, write the manifest) as `done`/`total` steps on `GET /projects/{slug}/progress` (`ProjectProgress.release`); the dialog shows them as a bar. A second cut on the same project while one runs is a 409

## Edge Cases
- A crash between the data files and the manifest leaves no committed release; the next cut of that name overwrites the partial files
- Annotation counting matches regions by id: Label Studio keeps a prediction region's id when an annotator accepts it

## Verification
- `test_loop_services.py::test_full_loop` (409 while incomplete, 409 on re-cut, tampered file fails re-verification), `test_cross_check_mismatch_blocks_release`, `test_coco.py`, `test_progress.py` (release steps, duplicate refusal)
- Live: `pnpm test:live:loop` checks every manifest file's size and sha256 on B2

## Related Docs
- [Verification](verification.md), [Dataset library](dataset-library.md)
