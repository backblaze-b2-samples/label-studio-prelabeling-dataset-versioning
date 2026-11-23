<!-- last_verified: 2026-11-23 -->
# Feature: Verification

## Purpose
Show, for one project, whether B2 holds a pre-label and an annotation for every task — and flag every task that would make a release incomplete.

## Used By
- UI: "Verify" action and the "Verification" tab; "Re-verify" on a release
- API: `GET /projects/{slug}/verification` (live, writes nothing), `POST /projects/{slug}/releases/{release}/verify`

## Core Functions
- `service/verification.py` — `diff` (pure), `gather`, `report`
- `service/annotations.py` — parses both target-storage object shapes
- `service/release_checks.py` — release re-verification from B2 alone

## Outputs
- `VerificationReport`: `status` (`complete` only when tasks > 0 and nothing is flagged), counts (raw objects, tasks, tasks with pre-labels, tasks with annotations, annotation objects, boxes), `flagged` tasks with reasons, and `checks` for a release

## Flag reasons
| Reason | Meaning | Fix |
|---|---|---|
| `missing_annotation` | no annotation in Label Studio or on B2 | label it in Label Studio |
| `missing_in_export` | annotated in Label Studio, no object on B2 yet | Sync annotations |
| `missing_prelabel` | no record in the latest pre-label run | Run pre-labels |
| `missing_source_object` | the raw image is gone (or changed, for a release) | restore it, or re-sync |
| `missing_task` | a raw image Label Studio has not imported | Sync from B2 |

## Release checks
Each manifest file's size and sha256, COCO images = manifest tasks, COCO boxes = manifest total, the stored Label Studio export agrees with COCO, and every task row's source (with ETag), pre-label and annotation object still exists.

## Verification
- `services/api/tests/test_verification.py`, `test_loop_services.py`
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_verification.py -q`

## Related Docs
- [Dataset releases](dataset-releases.md)
