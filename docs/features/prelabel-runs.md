<!-- last_verified: 2026-11-23 -->
# Feature: Pre-label Runs

## Purpose
Score every task with a local object detector once, keep the suggestions as a versioned record on B2, and show them in Label Studio so annotators only correct.

## Used By
- UI: "Run pre-labels" on the project page; "Pre-label runs" tab; Library "Pre-label runs"
- API: `POST /projects/{slug}/prelabel-runs` (`PrelabelRunCreate.threshold`, optional), `GET /projects/{slug}/prelabel-runs`, `GET /projects/{slug}/progress` (`ProjectProgress.prelabel`: stage, done/total tasks)

## Core Functions
- `service/prelabels.py` — `run`, `list_runs`, `load_records`
- `repo/ml_backend.py` — `/predict` and `/info` client
- `repo/progress.py` — in-process job progress (one run per project at a time)
- `services/ml-backend/` — the model server (Label Studio ML backend protocol)

## Model
| | |
|---|---|
| Model | RT-DETR R18 (`PekingU/rtdetr_r18vd_coco_o365`) via Hugging Face `transformers` |
| License | Apache-2.0 (model card) |
| Revision | `386c43855d01bcd966e548f3296fbd2cd2a2a40b` (pinned) |
| Device | auto-detect CUDA -> Apple MPS -> CPU; CPU in the default container |
| Cost | $0, local |

## Outputs
- `labeling/prelabels/<slug>/<run-id>/<image-stem>.json` per task: task id, source key and ETag, model id and revision, device, threshold, image size, Label Studio prediction id, score and the Label Studio `result`
- `labeling/prelabels/<slug>/<run-id>/_run.json`: the `PrelabelRun` summary (tasks, boxes, device, duration)
- One Label Studio prediction per task with `model_version=<run-id>`; the project's `model_version` is switched to the new run so the labeling UI shows it

## Flow
- List every task with `resolve_uri=false`, so each task keeps its raw `s3://<bucket>/<key>` image URI (Label Studio otherwise rewrites it to a browser-only `/tasks/<id>/resolve/?fileuri=<base64>` proxy URL); batches of `PRELABEL_BATCH_SIZE` (4) go to the ML backend `/predict` with the project's label config and threshold
- The backend reads each image from B2 by `s3://` URI (a `/tasks/<id>/resolve/?fileuri=` URL, which Label Studio sends when it calls the backend itself, is decoded back to that URI) with its own tagged S3 client, keeps only the project's labels and converts pixel boxes to Label Studio percentages
- Run id: `YYYYMMDDTHHMMSSZ-rtdetr-r18`
- Progress: the run registers itself in `repo/progress.py` ("Listing tasks in Label Studio" -> "Scoring tasks" N of M, updated after every task -> "Saving the run summary") and clears it in a `finally`. The project page polls `GET /projects/{slug}/progress` every 1.5s while a run is in flight and shows "Scoring tasks… N of M" with a progress bar
- Sync from B2 that adds tasks starts a pre-label run right away (the separate "Run pre-labels" button stays)
- On success the web app writes the run into the cached project detail and run list (`addRunToCache`) before refetching, so the Overview counts agree with the toast at once

## Edge Cases
- No tasks -> 409 "Sync from B2 first"
- A run already in flight for the project -> 409 "already in progress"; the UI disables the run buttons first
- Reload or navigate away mid-run -> the request keeps running on the API; on return the page reads the progress, shows the run as running and blocks a second one, and announces it with a toast when it finishes
- Progress is per API process: an API restart forgets it (the run's request dies with it), and multiple replicas would each keep their own (see docs/RELIABILITY.md)
- Two images with the same stem (`a.jpg`, `a.png`) -> the second record is `<stem>-t<task id>.json`
- A failed run -> a persistent alert on the project page (above the tabs and in the "Pre-label runs" tab) with a next step and the raw upstream message, until the next run or Dismiss; not kept across a reload
- A task with no detection above the threshold -> a record with an empty `result` (it still counts as pre-labelled)

## Verification
- `services/api/tests/test_loop_services.py::test_full_loop` (record shape), `test_progress.py` (N of M, duplicate refusal, cleanup on failure), `apps/web/src/lib/job-progress.test.ts`, `queries.test.ts::addRunToCache`, `test_http_clients.py::test_list_tasks_keeps_raw_s3_uris`, `apps/web/src/lib/project-next-step.test.ts` (failure hint), `services/ml-backend/tests/` (protocol shapes, resolve-URL decoding, device order)
- Real model check: see the README's evidence section
- Focused verify command: `pnpm test:ml`

## Related Docs
- [Label Studio stack](label-studio-stack.md), [Verification](verification.md)
