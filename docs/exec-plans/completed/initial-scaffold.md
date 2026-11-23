# Initial scaffold plan: label-studio-prelabeling-dataset-versioning

Built from [`backblaze-b2-samples/vibe-coding-starter-kit`](https://github.com/backblaze-b2-samples/vibe-coding-starter-kit)
at commit `b743b9fae8bf2ebd6aa6f4ae382daff750d6c730`. The starter kit is the ceiling: keep what this
app uses, trim what it does not, add only what the annotation loop needs.

Attribution token (S3 `user_agent_extra` and every `utm_content`): `b2ai-label-studio-annotation-loop`.

## 1. Purpose

**Problem:** Annotators label every image from scratch, and raw data, model suggestions and final labels end up in different places, so nobody can rebuild or audit a training set later.
**For:** Data providers and physical AI teams who run Label Studio and need versioned, auditable training data releases.
**What it does:**
- Syncs raw images from a B2 prefix into Label Studio as labeling tasks
- Pre-labels every task with a local object detection model and saves each run to B2
- Writes corrected annotations back to B2 through Label Studio target storage
- Exports an immutable COCO dataset release with a manifest of every task, pre-label and annotation
- Flags any task that has no annotation before a release is cut
**Where B2 fits:** One bucket holds raw images, pre-label runs, annotations and releases, so any release can be rebuilt and audited from storage alone.

Out of scope: patching Label Studio itself, a custom labeling UI, multi-user or SSO setup, active
learning loops, model training, hosting Label Studio publicly, and any proxy or fork that sits
between Label Studio and B2. Label Studio's own S3 source and target storage, pointed at the B2
S3 endpoint, is the mechanism. If that cannot work, the build stops and reports it; it does not
route around it.

## 2. Architecture delta from vibe-coding-starter-kit

The app keeps the kit's Next.js web app and FastAPI API, and adds a Docker Compose stack with
Label Studio Community Edition and a small ML backend. The API orchestrates the loop over
Label Studio's REST API and B2's S3 API. Label Studio runs locally only.

```
            B2 bucket (S3-compatible API)
  labeling/raw/<project>/            <- Label Studio source storage (read)
  labeling/prelabels/<project>/<run>/<- API writes one JSON per task per run
  labeling/annotations/<project>/    <- Label Studio target storage (write)
  labeling/exports/<project>/<rel>/  <- API writes COCO + manifest, immutable
  labeling/projects/<project>.json   <- project descriptor
        ^            ^             ^
        |            |             |
   Label Studio   ML backend     FastAPI API  <-- Next.js web app
   (compose,      (compose,      (pnpm dev)
    :8080)         :9090)
```

| Keep (as-is) | Trim (remove from starter) | Add (new) |
|---|---|---|
| Layered FastAPI (`types/config/repo/service/runtime`), JSON logging, `/metrics`, rate limit | `infra/vercel/`, `infra/railway/`, root `vercel.json`, root and API `railway.json`, `services/api/vercel.json`, `services/api/index.py`, `tests/test_vercel_entrypoint.py` (Label Studio must run beside the app; hosting it publicly is out of scope, so `deployment_targets` is `[]`) | `docker-compose.yml`: `label-studio` (pinned `heartexlabs/label-studio` tag, volume for its data, healthcheck) and `ml-backend` (built from `services/ml-backend/`) |
| `repo/b2_client.py` with the token swapped, `repo/list_cache.py`, `repo/b2_object.py`, `repo/b2_upload.py` | Dashboard upload-activity chart (`components/dashboard/upload-chart.tsx`) and the upload-activity stats it reads | `services/ml-backend/`: a minimal FastAPI app that implements the Label Studio ML backend protocol (`GET /health`, `POST /setup`, `POST /predict`) plus `GET /info`; no `label-studio-ml` SDK dependency |
| **Bucket explorer** (`/files`, file browser, preview, metadata panel, delete): never removable | Starter feature docs `dashboard.md`, `file-upload.md` rewritten (see section 5); nothing else of the kit's UI is removed | `repo/label_studio.py`: httpx client for the Label Studio REST API (projects, S3 import/export storages, sync, tasks, predictions, annotations, export) |
| Metadata extraction (it powers the bucket explorer's detail panel) | Starter screenshots in `sample.json` (`screenshots: []` until a later pipeline step takes new ones) | `repo/ml_backend.py`: httpx client for the ML backend |
| Presigned direct-to-B2 upload, adapted to target a project's raw prefix | | `service/projects.py`, `service/prelabels.py`, `service/releases.py`, `service/verification.py`, `service/coco.py` (pure conversion), `service/keys.py` (key layout) |
| Settings page (theme plus demo preferences), danger zone, command palette, health banner, design page | | `runtime/projects.py`, `runtime/releases.py`, `runtime/library.py`; types in `types/projects.py`, `types/releases.py`, `types/verification.py`, `types/library.py` |
| CI workflow, pre-commit, agent docs, `pnpm gen:api` / `gen:docs` / `gen:check`, `doctor`, `setup` | | Web: `/projects` (list + create), project detail (tabs: Overview, Pre-label runs, Releases, Verification), `/library` (sample-specific asset explorer) |
| `setup_b2_cors.py` (extended with the Label Studio origin, see section 3) | | `services/api/seed/images.json` + `scripts/seed_images.py` (download pinned CC0 images, upload to `labeling/raw/<project>/`) |
| | | `services/api/scripts/annotate_from_prelabels.py` (API-driven annotation for tests, see section 4) |
| | | `services/api/live_tests/test_annotation_loop.py` (end-to-end loop against Docker Compose and a B2 test bucket) |

**Bucket explorer vs Library.** `/files` stays the full-bucket browser from the kit. `/library` is
the sample's own explorer scoped to `labeling/`: pick a project, then switch between Raw images,
Pre-label runs (grouped by run id), Annotations and Releases (grouped by release). Each row shows
the B2 key, size and last modified; raw images also show their pre-label and annotation status, and
a release row opens its manifest. Rows deep-link to `/files?key=...` for preview and download, so
the Library does not duplicate the preview code.

**Upload.** The kit's `/upload` page stays and gains a required project selector. The presign
request carries `project` and the key becomes `labeling/raw/<project>/<filename>`. Only
`image/jpeg`, `image/png` and `image/webp` are accepted. A short note under the dropzone says
"Sync the project to turn new images into tasks."

**Dashboard.** Stat cards become: projects, tasks, annotated tasks (with percent), releases.
The recent uploads table becomes recent releases (project, release, images, annotations, created).

**Settings.** Demo preference fields become: default pre-label confidence threshold (segmented
control 0.3 / 0.5 / 0.7, default 0.5) and default release format (fixed to COCO, shown as a
read-only label, so no selector). Label Studio URL and ML backend URL are shown read-only from
`/health`.

### Label Studio setup details to verify, not assume

- Pin a current `heartexlabs/label-studio` release tag (no `latest`) and record it in the README.
- Bootstrap the admin user from compose env (`LABEL_STUDIO_USERNAME`, `LABEL_STUDIO_PASSWORD`,
  `LABEL_STUDIO_USER_TOKEN`), and disable sign-up without a link. Confirm that the bootstrap token
  authenticates `Authorization: Token <token>` on that pinned version. If legacy tokens are off by
  default there, enable them through the supported setting for that version, or switch the client
  to the personal access token refresh flow. Record which one in the README.
- Source storage: `POST /api/storages/s3` with `bucket`, `prefix=labeling/raw/<project>`,
  `regex_filter` for jpg/jpeg/png/webp, `use_blob_urls=true`, `presign=true`, `recursive_scan=true`,
  `aws_access_key_id`, `aws_secret_access_key`, `region_name=<B2_REGION>`,
  `s3_endpoint=https://s3.<B2_REGION>.backblazeb2.com`; then `POST /api/storages/s3/{id}/sync`.
- Target storage: `POST /api/storages/export/s3` with `prefix=labeling/annotations/<project>` and
  the same endpoint and credentials; `POST /api/storages/export/s3/{id}/sync` pushes annotations.
  Confirm the object naming and JSON shape the pinned version writes (per annotation or per task)
  and make verification read that shape. Check for a doubled `/` in keys.
- Images are shown in the Label Studio UI from presigned B2 URLs. Extend `setup_b2_cors.py` so the
  bucket CORS rule also allows the Label Studio origin (`LABEL_STUDIO_URL`) for `GET`/`HEAD`.
- Label Studio's own S3 client is upstream code and is not patched. Set
  `AWS_SDK_UA_APP_ID=b2ai-label-studio-annotation-loop` on the `label-studio` container so botocore
  appends it to that client's user agent. Confirm the bundled botocore honours it (capture one
  request's user agent, for example with botocore debug logging) and record the result. If it does
  not, record that in the README and in the B2 standards audit as the one client the sample
  cannot tag without patching Label Studio.
- The ML backend is registered on each project (`POST /api/ml`, `url=http://ml-backend:9090`) so it
  shows under the project's model settings, with automatic prediction on task open turned off.
  The authoritative pre-labels come from API pre-label runs (section 3), which also write to B2.

## 3. B2 surface

All B2 access is through the S3-compatible API. No b2-native API calls anywhere.

Three S3 clients exist, each tagged with `b2ai-label-studio-annotation-loop`:
1. API, `services/api/app/repo/b2_client.py` (`Config(user_agent_extra=...)`).
2. ML backend, `services/ml-backend/app/b2.py` (same `Config`), reads task images by `s3://` URI.
3. Label Studio's internal client, tagged through `AWS_SDK_UA_APP_ID` (see above).

Endpoint is always derived: `https://s3.${B2_REGION}.backblazeb2.com`.

| Operation | Who | Why |
|---|---|---|
| `list_objects_v2` | API, Label Studio | Count raw images, list pre-label runs, annotations and release files; Label Studio source sync |
| `get_object` | API, ML backend, Label Studio | Read annotation JSON for COCO build and verification; read images for prediction |
| `put_object` | API, Label Studio | Write pre-label JSON, release files, project descriptors; Label Studio target storage writes annotations |
| `head_object` | API | Release immutability check, `/health` probe, verification of exported file sizes |
| presigned `PUT` | API | Browser uploads raw images straight to B2 |
| presigned `GET` | API, Label Studio | Downloads and previews; Label Studio shows task images |
| `delete_object` / `delete_objects` | API | Bucket explorer delete; optional purge of a project's B2 data |
| `put_bucket_cors` | `setup_b2_cors.py` | Allow the web origin and the Label Studio origin |

### Key layout (`service/keys.py`, one module, unit-tested)

- `labeling/projects/<project>.json`: descriptor (slug, title, description, labels, threshold,
  Label Studio project id, storage ids, model id, created_at, updated_at)
- `labeling/raw/<project>/<file>`: raw images
- `labeling/prelabels/<project>/<run-id>/<image-stem>.json`: one per task, plus `_run.json`
- `labeling/annotations/<project>/...`: written by Label Studio target storage
- `labeling/exports/<project>/<release>/`: `annotations.coco.json`, `label-studio-export.json`,
  `manifest.json`

`<project>` slug: `^[a-z0-9][a-z0-9-]{1,47}$`. `<run-id>`: `YYYYMMDDTHHMMSSZ-<model-short>`.
`<release>`: `^[a-z0-9][a-z0-9._-]{0,63}$`, default `v<N+1>`. `b2_key_prefix` and the default
`ALLOWED_KEY_PREFIX` hint become `labeling/`.

### API endpoints (the one place this list is written)

Existing kit routes (`/health`, `/files*`, `/upload*`, `/metrics`) stay. Changes and additions:

| Path | Method | Request model | Response model |
|---|---|---|---|
| `/health` | GET | none | `HealthResponse` (extended with `label_studio: ServiceStatus`, `ml_backend: ServiceStatus`) |
| `/upload/presign` | POST | `PresignUploadRequest` (adds required `project: str`) | `PresignUploadResponse` |
| `/models` | GET | none | `ModelInfo` (id, name, license, source URL, revision, device, `labels: list[str]`) |
| `/projects` | GET | none | `list[LabelingProject]` |
| `/projects` | POST | `ProjectCreate` | `LabelingProject` (201) |
| `/projects/{slug}` | GET | none | `ProjectDetail` (project + `ProjectCounts` + latest run + latest release) |
| `/projects/{slug}` | PATCH | `ProjectUpdate` | `LabelingProject` |
| `/projects/{slug}` | DELETE | query `purge_b2: bool = false` | `ProjectDeleted` |
| `/projects/{slug}/sync` | POST | none | `SyncResult` (raw objects seen, tasks before/after) |
| `/projects/{slug}/prelabel-runs` | GET | none | `list[PrelabelRun]` |
| `/projects/{slug}/prelabel-runs` | POST | `PrelabelRunCreate` (`threshold: float \| None`) | `PrelabelRun` (run id, tasks, boxes, B2 prefix, duration) |
| `/projects/{slug}/annotations/sync` | POST | none | `AnnotationSyncResult` (annotation objects in B2) |
| `/projects/{slug}/verification` | GET | none | `VerificationReport` (live, writes nothing) |
| `/projects/{slug}/releases` | GET | none | `list[DatasetRelease]` |
| `/projects/{slug}/releases` | POST | `ReleaseCreate` (`name: str \| None`, `notes: str \| None`) | `DatasetRelease` (201); 409 `ReleaseBlocked` when any task is flagged or the release exists |
| `/projects/{slug}/releases/{release}` | GET | none | `DatasetRelease` (with `manifest: ReleaseManifest`) |
| `/projects/{slug}/releases/{release}/verify` | POST | none | `VerificationReport` (re-reads the release from B2 and re-checks it) |
| `/projects/{slug}/assets` | GET | query `kind: raw\|prelabels\|annotations\|exports`, `run`, `release`, `cursor` | `AssetPage` |

`LabelingProject`: slug, title, description, labels, threshold, model_id, label_studio_project_id,
label_studio_url (deep link), source_prefix, target_prefix, created_at, updated_at.
`ProjectCreate`: title, description, labels, threshold, seed_sample_images.
`ProjectUpdate`: title, description, threshold. `VerificationReport`: status `complete|incomplete`,
counts (raw objects, tasks, tasks with pre-labels, tasks with annotations, annotation objects,
boxes), `flagged: list[FlaggedTask]` (task id, source key, reasons such as `missing_annotation`,
`missing_prelabel`, `missing_source_object`, `missing_in_export`), and checks for a release.
`ReleaseManifest`: release, project, created_at, prelabel run id, model id and revision,
Label Studio version, per-task rows (task id, source key, source ETag, pre-label key, annotation
key, box counts, accepted/corrected/added/removed), per-file rows (key, bytes, sha256), totals.

### Flow details

- **Sync**: trigger the source storage sync, then read back task count and assert it equals the
  number of matching raw objects.
- **Pre-label run**: list all tasks, send them in batches to the ML backend `/predict`, write one
  JSON per task to the run prefix (task id, source key and ETag, model id and revision, threshold,
  Label Studio `result`), write `_run.json`, then create Label Studio predictions with
  `model_version=<run-id>`.
- **Release**: build `annotations.coco.json` from the annotation objects in B2 (not from Label
  Studio), also save Label Studio's own JSON export as `label-studio-export.json`, cross-check both
  (same task set, same box count), compute sha256 per file, write `manifest.json` last. Refuse
  with 409 if `manifest.json` already exists or if verification is incomplete.
- **COCO conversion** (`service/coco.py`, pure): Label Studio `rectanglelabels` values are
  percentages of `original_width` / `original_height`; convert to pixel `[x, y, w, h]`, round to
  two decimals, category ids from the project's label order.

## 4. Key features

1. **Labeling projects** (primary entity, `/projects`): create a project bound to
   `labeling/raw/<project>/`, connected to Label Studio source and target storage on B2.
2. **Pre-label runs**: a local object detector writes versioned suggestions to B2 and into
   Label Studio, so annotators only correct.
3. **Annotation loop**: annotators correct in Label Studio; target storage writes every
   annotation to `labeling/annotations/<project>/`. A deep link opens the project in Label Studio.
4. **Dataset releases**: immutable COCO releases with a manifest under
   `labeling/exports/<project>/<release>/`.
5. **Verification**: compare raw objects, tasks, pre-labels, annotations and release files, and flag
   any task missing a label.
6. **Dataset library** (`/library`): the sample's asset explorer scoped to `labeling/`.

### Model provider (per feature)

| Feature | Provider / model | deployment | Cost per demo run | Key env var |
|---|---|---|---|---|
| Pre-label runs | RT-DETR R18 (`PekingU/rtdetr_r18vd_coco_o365` on Hugging Face, via `transformers`), Apache-2.0, revision pinned | `local` | $0 | none |

Rule applied: there is no remote API to choose; the use case asks for a local model, and the
workload is small enough for CPU. Device: auto-detect CUDA, then Apple MPS, then CPU at runtime;
CPU is the default and nothing requires a GPU. Inside the Linux container MPS is never present, so
there it is CUDA then CPU; running the ML backend natively on a Mac picks MPS. The build must
confirm the model card license is Apache-2.0 and pin a revision hash. If that model cannot load on
CPU in the pinned `transformers`, fall back to `facebook/detr-resnet-50` (Apache-2.0) and record
the switch. Ultralytics YOLO models are excluded (AGPL-3.0). Install CPU-only torch wheels in the
ML backend image to keep it small.

### Seed image set

Eight photos of street scenes (people, cars, bicycles, buses) from Wikimedia Commons, each
**CC0 or public domain**, verified through the Commons API (`extmetadata.LicenseShortName`). Pin
each file URL, sha256, author, license and source page in `services/api/seed/images.json`. The
seed script downloads them at run time with a descriptive user agent and uploads them to B2; no
image binaries are committed. Before pinning, run the model on each candidate and keep only images
with at least one detection at threshold 0.5. Record every source and license in the README.

### Primary entity lifecycle: `LabelingProject`

| Verb | In UI | How |
|---|---|---|
| create | yes | "New project" dialog on `/projects` |
| read | yes | project list and project detail |
| edit | yes | "Edit project" dialog on project detail: title, description, threshold |
| delete | yes | project detail danger zone: deletes the Label Studio project and the descriptor; "Also delete this project's B2 data" switch, default off, with typed-slug confirmation |
| run | yes | project detail actions: Sync from B2, Run pre-labels, Sync annotations, Verify, Cut release, Open in Label Studio |

No verb is omitted. The label set is shown read-only in the edit form with the reason: "Labels are
fixed after creation because Label Studio rejects a config that drops labels existing annotations
use. Create a new project to change them." Releases are a secondary, immutable record, so they have
no edit or delete by design; a release is re-verifiable from the UI.

`annotate_from_prelabels.py` is a test and demo script, not a UI verb: it submits annotations
through the Label Studio API so the loop can be tested without a person. It accepts each
prediction, nudges the first box of every even task by 2 percent (a correction), adds one box to a
task with no predictions, and links each annotation to its prediction (`parent_prediction`) so the
manifest can count accepted, corrected, added and removed boxes. People label in the Label Studio
UI.

### Form UX conventions

Create form (`ProjectCreate`):
- `title`: free text; placeholder "Street scenes, batch 1"; `FormDescription` shows the derived
  slug and B2 prefix `labeling/raw/<slug>/` live.
- `description`: textarea, optional; placeholder "What this batch is for".
- `labels`: finite set from `GET /models` labels, so a checkbox group (multi-select), never free
  text; default selection person, car, bicycle, bus; at least one required.
- `threshold`: finite set, segmented control 0.3 / 0.5 / 0.7; `FormDescription`: "0.5 is a sound
  default; lower adds more boxes to correct."
- `seed_sample_images`: switch, default on; `FormDescription`: "Copies the 8 CC0 sample images
  into this project's raw prefix."

Edit form (`ProjectUpdate`): opens pre-filled; `threshold` uses the same segmented control;
labels shown read-only as described. Release form: `name` free text with the default `v<N+1>`
shown as placeholder; `notes` optional textarea. Use
`apps/web/src/components/settings/settings-form.tsx` as the exemplar.

## 5. Doc transforms

- Rewrite: `README.md` (via `pnpm gen:docs` plus hand-written sections: Docker Compose quick
  start, Label Studio version and token method, model and image licenses, B2 standards audit,
  correctness evidence table from a real run, human validation checklist), `ARCHITECTURE.md`,
  `PRODUCT.md`, `docs/app-workflows.md`, `docs/SECURITY.md` (Label Studio stores the B2 key in its
  local database volume; use a key scoped to the test bucket; Label Studio is not exposed beyond
  localhost), `docs/RELIABILITY.md`, `docs/verification.md` (unit, live and human checks),
  `docs/features/dashboard.md`, `docs/features/file-upload.md` (raw image upload to a project).
- Keep: `docs/features/file-browser.md`, `docs/features/metadata-extraction.md`,
  `docs/features/settings.md` (updated for the new preference fields), `docs/design-system.md`,
  `docs/frontend-conventions.md`, `docs/dev-workflows.md` (add `docker compose up -d`).
- Delete: `infra/vercel/README.md`, `infra/railway/README.md`.
- Add: `docs/features/labeling-projects.md`, `prelabel-runs.md`, `dataset-releases.md`,
  `verification.md` (feature), `dataset-library.md`, `label-studio-stack.md`.

### Declared identity: `docs/exec-plans/sample.json`

The build writes this file first, before
running `pnpm gen:docs`. Every field of `scripts/gen/sample.schema.json` is set:

- `schema_version`: 1
- `name`: `Label Studio Prelabeling Dataset Versioning` (equals `APP_NAME`; derived `APP_SLUG` is
  `label-studio-prelabeling-dataset-versioning`)
- `slug`: `label-studio-prelabeling-dataset-versioning`
- `package_scope`: `@label-studio-prelabeling-dataset-versioning`
- `purpose`: "Connects Label Studio to Backblaze B2 as source and target storage, pre-labels tasks with a local model, and exports versioned, verified dataset releases back to the same bucket."
- `tagline`: "Pre-label, correct and release datasets with Label Studio on B2."
- `primary_entity`: `{schema: LabelingProject, singular: labeling project, plural: labeling projects}`
- `features`: Labeling Projects `/projects`, Pre-label Runs (null route), Dataset Releases (null
  route), Verification (null route), Dataset Library `/library`, Raw Image Upload `/upload`,
  File Browser `/files`, Dashboard `/`, Settings `/settings`, Metadata Extraction (null), Label
  Studio Stack (null)
- `b2_surface`: the table in section 3
- `b2_key_prefix`: `labeling/`
- `stack`: web as kit; api "FastAPI, Python 3.12+, boto3, httpx, Pydantic v2, Pillow"; storage
  "Backblaze B2 (S3-compatible API)"; package manager "pnpm workspaces"; Label Studio and the ML
  backend are described in the README and ARCHITECTURE.md
- `deployment_targets`: `[]` (if the generator or checks reject an empty list, keep the smallest
  change that passes and record it as a deviation; do not add a hosted Label Studio)
- `env_vars`: `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_REGION`
  (required), `B2_PUBLIC_URL_BASE` (optional, commented in `.env.example`), `LABEL_STUDIO_URL`
  (default `http://localhost:8080`), `LABEL_STUDIO_API_TOKEN` (secret; `pnpm setup` generates it
  and compose passes the same value as `LABEL_STUDIO_USER_TOKEN`), `LABEL_STUDIO_USERNAME`,
  `LABEL_STUDIO_PASSWORD` (secret, local bootstrap admin), `ML_BACKEND_URL` (default
  `http://localhost:9090`), `NEXT_PUBLIC_API_URL` (optional)
- `attribution_token`: `b2ai-label-studio-annotation-loop`
- `repo`: `{org: backblaze-b2-samples, name: label-studio-prelabeling-dataset-versioning}`
- `screenshots`: `[]`

## 6. Rename table

| From | To |
|---|---|
| `vibe-coding-starter-kit` | `label-studio-prelabeling-dataset-versioning` |
| `vibe_coding_starter_kit` | `label_studio_prelabeling_dataset_versioning` |
| `Vibe Coding Starter Kit` | `Label Studio Prelabeling Dataset Versioning` |
| `@vibe-coding-starter-kit/web`, `@vibe-coding-starter-kit/shared` | `@label-studio-prelabeling-dataset-versioning/web`, `.../shared` |
| `b2ai-oss-start` (user agent and `utm_content`) | `b2ai-label-studio-annotation-loop` |
| `APP_DESCRIPTION` "File management dashboard template powered by Backblaze B2" | "Label Studio pre-labeling and versioned dataset releases on Backblaze B2" |
| FastAPI title, `localStorage` namespace, CORS rule id | derived from `sample.json` / `APP_SLUG` by the generator |
| Docker image tags and compose project name | `label-studio-prelabeling-dataset-versioning-ml-backend`, compose `name: label-studio-prelabeling-dataset-versioning` |
| CI workflow names and pyproject `name` | new slug |
| `uploads/` key prefix | `labeling/` |

## 7. Tests and evidence

- **Unit (hermetic, `pnpm test:api`)**: key layout and name validation, COCO conversion (percent to
  pixels, category ids, empty annotations), verification diff (complete, each flag reason),
  release immutability (409), release refused when incomplete, pre-label record shape, Label Studio
  client against `httpx.MockTransport`, ML backend client, projects service with the repo
  boundary mocked, layering test (boto3 and httpx clients only in `repo/`).
- **ML backend unit tests**: `/health`, `/setup`, `/predict` response shape with a stub model;
  device selection order.
- **Live loop (`pnpm test:live:loop`, needs Docker Compose up and a B2 test bucket)**: create a
  run-unique project, seed 4 images, sync, assert tasks equal raw objects, run pre-labels, assert
  one pre-label object per task, annotate all but one task, assert release is refused with exactly
  that task flagged, annotate it, sync annotations, cut release, verify: every task has a pre-label,
  an annotation object and a COCO image entry; COCO annotation count equals the sum of annotation
  boxes; Label Studio export and COCO agree; every file in the manifest exists in B2 with matching
  size and sha256. Clean up with `purge_b2=true`.
- **Web**: vitest for new hooks and form schemas; Playwright smoke for project create with the API
  mocked, following the kit's fixtures.
- Run `/b2-doctor`; record the audit (including the Label Studio client note) and the live-loop
  counts in the README. If Docker or B2 credentials are not available during the build, say so in the
  README and the summary; never report an unrun check as passed.
- Human checks (README): label a few tasks in the Label Studio UI, cut a release, confirm the files
  appear under `labeling/exports/<project>/<release>/` in the Library and the bucket explorer.
