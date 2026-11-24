<!-- last_verified: 2026-11-23 -->
# Architecture

## Components

<!-- gen:begin arch-components -->
Connects Label Studio to Backblaze B2 as source and target storage, pre-labels tasks with a local model, and exports versioned, verified dataset releases back to the same bucket.

- **apps/web/** — Next.js 16, React 19, Tailwind v4, shadcn/ui, TanStack Query
  - Labeling Projects (`/projects`) — create, edit, delete and run projects bound to Label Studio source and target storage on B2
  - Dataset Library (`/library`) — browse raw images, pre-label runs, annotations and releases per project
  - Raw Image Upload (`/upload`) — upload raw images straight to a project's B2 prefix
  - File Browser (`/files`) — browse, preview, download and delete any object in the bucket
  - Dashboard (`/`) — projects, tasks, annotated tasks, releases and recent releases
  - Settings (`/settings`) — theme, default pre-label threshold and service status
- **services/api/** — FastAPI, Python 3.12+, boto3, httpx, Pydantic v2, Pillow
  - REST API for every operation the frontend consumes, exported to `docs/api/openapi.json`
  - Backblaze B2 (S3-compatible API) access isolated in the `repo/` layer
  - Pre-label Runs — local object detector writes versioned suggestions to B2 and into Label Studio
  - Dataset Releases — immutable COCO releases with a manifest, written back to B2
  - Verification — compare tasks, pre-labels, annotations and release files, and flag missing labels
  - Metadata Extraction — image dimensions, EXIF and checksums in the bucket explorer
  - Label Studio Stack — Docker Compose with Label Studio and the ML backend
  - Structured JSON logging with request tracing, plus `/health` and Prometheus `/metrics`
- **packages/shared/** — TypeScript types generated from the API contract by `pnpm gen:api`, consumed by `apps/web/` as a workspace dependency (pnpm workspaces)
<!-- gen:end arch-components -->

## Backend Layering

The API follows a strict layered architecture:

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access (boto3 B2 client; httpx adapters for Label Studio,
           the ML backend and the seed-image source) — no business logic
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (e.g., service must not import from runtime)
3. `boto3` and `httpx` only allowed in `repo/` layer
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Authored Python files under `services/api/app/` stay under 300 lines

### Directory Structure

<!-- gen:begin arch-directory -->
```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Pydantic models, and the response-model base
    config/                Settings loaded from environment
    repo/                  B2 S3 client (data access layer)
    service/               Business logic
    runtime/               FastAPI route handlers
  scripts/                 Operational scripts (OpenAPI export, bucket CORS)
  tests/                   pytest tests (structural + integration)
```
<!-- gen:end arch-directory -->

The ML backend is a second, much smaller Python service at
`services/ml-backend/` (FastAPI + `transformers`): `app/main.py` (protocol
routes), `app/model.py` (lazy RT-DETR load), `app/device.py` (CUDA -> MPS ->
CPU), `app/b2.py` (its own tagged S3 client), `app/labelstudio.py` (label config
in, `rectanglelabels` out). The sample API never imports it; they talk HTTP.

## System Overview

```
            B2 bucket (S3-compatible API)
  labeling/raw/<project>/             <- Label Studio source storage (read)
  labeling/prelabels/<project>/<run>/ <- API writes one JSON per task per run
  labeling/annotations/<project>/     <- Label Studio target storage (write)
  labeling/exports/<project>/<rel>/   <- API writes COCO + manifest, immutable
  labeling/projects/<project>.json    <- project descriptor
        ^            ^             ^
        |            |             |
   Label Studio   ML backend     FastAPI API  <-- Next.js web app
   (compose,      (compose,      (pnpm dev)
    :8080)         :9090)
```

Label Studio Community Edition runs unmodified. Its own S3 source and target
storages point at the B2 S3 endpoint (`https://s3.<B2_REGION>.backblazeb2.com`);
there is no proxy, fork or patch between Label Studio and B2. The API
orchestrates the loop over Label Studio's REST API and B2's S3 API, and writes
everything Label Studio does not (pre-label records, releases, descriptors).

## Boundary Invariants

- **No external SDK leakage**: `boto3` and `httpx` are only imported in `app/repo/` (`tests/test_structure.py` asserts both). Label Studio, the ML backend and Wikimedia Commons are reached through `repo/label_studio.py`, `repo/ml_backend.py` and `repo/seed_source.py`; their failures surface as `UpstreamServiceError`, which `service/deps.py::upstream()` turns into a 503 (unreachable) or 502.
- **One key layout**: every B2 key under `labeling/` is built by `service/keys.py`, so writer and verifier cannot disagree.
- **No raw dicts at boundaries**: All data crossing layer boundaries uses typed Pydantic models; service errors map to HTTP in one handler (`runtime/errors.py`).
- **No cross-layer mutable state**: Configuration is read-only after init. Intra-layer caches/counters (the listing cache in `repo/list_cache.py`, the B2 connectivity cache in `repo/b2_client.py`, the download counter in `repo/counter.py`, the rate-limit and metrics state in `runtime/`) are module-local and guarded by a `threading.Lock`. Labeling views deliberately bypass the listing cache (`repo/b2_objects.py`): verification and releases must see the bucket as it is now.
- **Validated inputs**: All HTTP inputs validated by FastAPI/Pydantic. Project slugs, release names and run ids are validated against the key layout; file keys reject path traversal; optional prefix confinement via `ALLOWED_KEY_PREFIX=labeling/`.

## Deployment

- **Local only.** `docker compose up -d` runs Label Studio (pinned `heartexlabs/label-studio:1.23.2`) and the ML backend, both bound to `127.0.0.1`; `pnpm dev` runs the web app and API on the host. Label Studio stores the B2 key it is given in its own database volume, and hosting it publicly is out of scope, so this sample ships no deployment target (`deployment_targets: []`).
- The kit's delivery runbooks under `infra/` are kept because the doc generator owns them, but this sample does not ship their platform config (`vercel.json`, `railway.json`, `services/api/index.py` were removed). Deploying the web app and API without Label Studio beside them gives a bucket explorer with no annotation loop.

External provisioning and deployment remain explicit user-approved actions.

## B2 Clients and Attribution

| Client | Where | User agent |
|---|---|---|
| API (boto3) | `services/api/app/repo/b2_client.py` | `Config(user_agent_extra="b2ai-label-studio-annotation-loop")` |
| ML backend (boto3) | `services/ml-backend/app/b2.py` | same `user_agent_extra` |
| Label Studio (its bundled boto3 1.39.3) | upstream, unpatched | `AWS_SDK_UA_APP_ID=b2ai-label-studio-annotation-loop` in compose; botocore appends `app/b2ai-label-studio-annotation-loop` |
| CORS helper (boto3) | `services/api/scripts/setup_b2_cors.py` | same `user_agent_extra` |

The Label Studio row was verified by constructing a client exactly as Label
Studio 1.23.2's `create_s3_client_and_resource` does, with botocore 1.39.3 and
the variable set, and capturing the request's User-Agent header (see the
README's B2 standards audit). It was not captured from inside the running
container, because Docker was not available where this sample was built.

## Data Stores

<!-- gen:begin arch-data-stores -->
- **Backblaze B2 (S3-compatible API)** — the only data store; there is no application database
  - Every object this app writes lives under the `labeling/` key prefix of one bucket
  - Listing, per-key metadata and presigned URLs all come from the S3 surface below
  - The primary entity is `LabelingProject`; one labeling project is one object
<!-- gen:end arch-data-stores -->

## External Services

<!-- gen:begin arch-external-services -->
- **Backblaze B2 (S3-compatible API)** — reached only through `services/api/app/repo/`, using:
  - `list_objects_v2` — count raw images, list pre-label runs, annotations and release files; Label Studio source sync
  - `get_object` — read annotation JSON for the COCO build and verification; the ML backend reads task images
  - `put_object` — write pre-labels, release files and project descriptors; Label Studio target storage writes annotations
  - `head_object` — release immutability check, file checks in verification, and the /health probe
  - `presigned PUT` — the browser uploads raw images straight to B2
  - `presigned GET` — downloads and previews; Label Studio shows task images
  - `delete_object` — bucket explorer delete and the optional purge of a project's B2 data
<!-- gen:end arch-external-services -->

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md) for full security documentation.

- **Frontend -> API** — CORS-restricted to configured origins. `CORSMiddleware` is registered LAST in `main.py` (outermost) so it wraps **every** response, including uncaught-exception 500s. See [docs/RELIABILITY.md](docs/RELIABILITY.md#error-handling). A per-IP rate-limit middleware sits inner to CORS.
- **API -> Label Studio** — `Authorization: Token <LABEL_STUDIO_API_TOKEN>` (the bootstrap admin's legacy token, enabled with `LABEL_STUDIO_ENABLE_LEGACY_API_TOKEN=true`). The API hands Label Studio the B2 key when it creates storages; Label Studio keeps it in its database volume.
- **API / ML backend / Label Studio -> B2** — application key, signature v4, S3-compatible API only.
- **Browser -> B2** — presigned PUT for raw-image uploads; presigned GET for previews and for the images the labeling UI shows (Label Studio presigns those, 15 minutes). The bucket CORS rule `<slug>-label-studio` allows the Label Studio origin GET/HEAD only.
- **Label Studio -> ML backend** — over the compose network; `ML_BLOCK_LOCAL_IP=false` lets Label Studio reach that private address (storage SSRF checks stay on).

## Data Flows

- **Create project**: Browser -> `POST /projects` -> (optional) seed images to `labeling/raw/<slug>/` -> Label Studio project + target storage + ML backend registration (+ source storage if the prefix has images) -> descriptor `labeling/projects/<slug>.json`
- **Sync**: `POST /projects/{slug}/sync` -> Label Studio source-storage sync (Label Studio lists B2 itself) -> API compares tasks with raw objects
- **Pre-label run**: `POST /projects/{slug}/prelabel-runs` -> tasks from Label Studio -> ML backend `/predict` (the backend reads each image from B2 by `s3://` URI) -> one JSON per task + `_run.json` on B2 -> Label Studio predictions with `model_version=<run-id>`
- **Annotate**: annotator in Label Studio -> Label Studio target storage writes `labeling/annotations/<slug>/<annotation id>` on B2 (on save, and again on `POST .../annotations/sync`)
- **Verify**: `GET /projects/{slug}/verification` -> raw listing + tasks + latest run records + annotation objects -> diff (writes nothing)
- **Release**: `POST /projects/{slug}/releases` -> verification must be complete -> COCO from B2 annotation objects + Label Studio JSON export -> cross-check -> `annotations.coco.json`, `label-studio-export.json`, then `manifest.json` (sha256 per file) last
- **Bucket explorer** (kit): `GET /files`, previews, downloads and deletes over presigned URLs, unchanged

## Observability

- Structured JSON logging on all requests with `request_id`; pre-label runs and releases log their counts
- Request timing middleware (also the catch-all that converts uncaught exceptions to a typed JSON 500)
- `/metrics` endpoint (Prometheus format: request count, latency, upload count)
- `/health`: B2 connectivity plus Label Studio (version) and ML backend (model, device) reachability; the web app's banner names whichever is down

## API Contract

<!-- gen:begin arch-api-contract -->
- Checked-in OpenAPI artifact: `docs/api/openapi.json`
- Export / check: `pnpm contract:export` / `pnpm contract:check`
- Generate the client seam from it: `pnpm gen:api` (drift gate: `pnpm gen:check`)
- FastAPI freshness test: `services/api/tests/test_openapi_contract.py`
- Frontend route drift test: `apps/web/src/lib/api-contract.test.ts`

The FastAPI routers and Pydantic models are the single source of truth. The
frontend's `API_CLIENT_ROUTES` registry, the `qk` query-key factory and the
shared TypeScript types are **generated** from the exported artifact by
`pnpm gen:api`, so the client cannot drift from the backend — there is no
hand-written copy left to disagree. The two contract tests are kept as a
belt-and-braces check that the generated files and the committed artifact are
still in step.

| Route | Returns | Generated client route |
| --- | --- | --- |
| `DELETE /files-by-key` | `DeleteFileResponse` | `fileByKeyDelete` |
| `DELETE /files/{key}` | `DeleteFileResponse` | `legacyFileDelete` |
| `DELETE /projects/{slug}` | `ProjectDeleted` | `projectDelete` |
| `GET /dashboard` | `DashboardSummary` | `dashboard` |
| `GET /files` | `FileMetadata[]` | `files` |
| `GET /files-by-key/detail` | `FileMetadataDetail` | `fileByKeyDetail` |
| `GET /files-by-key/download` | `FileUrlResponse` | `fileByKeyDownload` |
| `GET /files-by-key/metadata` | `FileMetadata` | `fileByKeyMetadata` |
| `GET /files-by-key/preview` | `FileUrlResponse` | `fileByKeyPreview` |
| `GET /files/{key}` | `FileMetadata` | `legacyFileMetadata` |
| `GET /files/{key}/download` | `FileUrlResponse` | `legacyFileDownload` |
| `GET /files/{key}/preview` | `FileUrlResponse` | `legacyFilePreview` |
| `GET /files/stats` | `UploadStats` | `fileStats` |
| `GET /health` | `HealthStatus` | `health` |
| `GET /metrics` | — | _server-only_ |
| `GET /models` | `ModelInfo` | `models` |
| `GET /project-creates` | `ProjectCreating[]` | `projectCreates` |
| `GET /projects` | `LabelingProject[]` | `projects` |
| `GET /projects/{slug}` | `ProjectDetail` | `project` |
| `GET /projects/{slug}/assets` | `AssetPage` | `assets` |
| `GET /projects/{slug}/prelabel-runs` | `PrelabelRun[]` | `prelabelRuns` |
| `GET /projects/{slug}/progress` | `ProjectProgress` | `projectProgress` |
| `GET /projects/{slug}/releases` | `DatasetRelease[]` | `releases` |
| `GET /projects/{slug}/releases/{release}` | `DatasetRelease` | `release` |
| `GET /projects/{slug}/verification` | `VerificationReport` | `verification` |
| `PATCH /projects/{slug}` | `LabelingProject` | `projectUpdate` |
| `POST /projects` | — | `projectCreate` |
| `POST /projects/{slug}/annotations/sync` | `AnnotationSyncResult` | `annotationsSync` |
| `POST /projects/{slug}/prelabel-runs` | `PrelabelRun` | `prelabelRunCreate` |
| `POST /projects/{slug}/releases` | — | `releaseCreate` |
| `POST /projects/{slug}/releases/{release}/verify` | `VerificationReport` | `releaseVerify` |
| `POST /projects/{slug}/sync` | `SyncResult` | `projectSync` |
| `POST /upload/presign` | `PresignUploadResponse` | `uploadPresign` |
| `POST /upload/verify` | `FileUploadResponse` | `uploadVerify` |
<!-- gen:end arch-api-contract -->

## Canonical Files

<!-- gen:begin arch-canonical-files -->
Hand-written — this is the file to edit:

- Layered API handler: `services/api/app/runtime/`
- Service orchestration: `services/api/app/service/`
- B2 data access (repo layer): `services/api/app/repo/b2_client.py`
- Pydantic models: `services/api/app/types/` (`base.py` carries the response-model config)
- Config (pydantic-settings): `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- OpenAPI exporter: `services/api/scripts/export_openapi.py`
- Frontend API client — error policy, transport, fallback: `apps/web/src/lib/api-client.ts`
- Frontend data layer — caching, invalidation, polling: `apps/web/src/lib/queries.ts`
- Shared type barrel: `packages/shared/src/types.ts`
- Generator policy: `scripts/gen/api-gen.config.json`
- Sample manifest behind the generated docs: `docs/exec-plans/sample.json`

Generated — **never hand-edit**; change the source and re-run the command:

- `docs/api/openapi.json` — `pnpm contract:export` (source: the routers and models)
- `packages/shared/src/generated/api-types.ts` — `pnpm gen:api`
- `apps/web/src/lib/generated/api-routes.ts` — `pnpm gen:api`
- `apps/web/src/lib/generated/query-keys.ts` — `pnpm gen:api`
- The marker-delimited regions of this file, `AGENTS.md`, `README.md` and the 0 `infra/` runbooks — `pnpm gen:docs`
<!-- gen:end arch-canonical-files -->

## Core Features

<!-- gen:begin arch-core-features -->
- [Labeling Projects](docs/features/labeling-projects.md) — create, edit, delete and run projects bound to Label Studio source and target storage on B2
- [Pre-label Runs](docs/features/prelabel-runs.md) — local object detector writes versioned suggestions to B2 and into Label Studio
- [Dataset Releases](docs/features/dataset-releases.md) — immutable COCO releases with a manifest, written back to B2
- [Verification](docs/features/verification.md) — compare tasks, pre-labels, annotations and release files, and flag missing labels
- [Dataset Library](docs/features/dataset-library.md) — browse raw images, pre-label runs, annotations and releases per project
- [Raw Image Upload](docs/features/file-upload.md) — upload raw images straight to a project's B2 prefix
- [File Browser](docs/features/file-browser.md) — browse, preview, download and delete any object in the bucket
- [Dashboard](docs/features/dashboard.md) — projects, tasks, annotated tasks, releases and recent releases
- [Settings](docs/features/settings.md) — theme, default pre-label threshold and service status
- [Metadata Extraction](docs/features/metadata-extraction.md) — image dimensions, EXIF and checksums in the bucket explorer
- [Label Studio Stack](docs/features/label-studio-stack.md) — Docker Compose with Label Studio and the ML backend
<!-- gen:end arch-core-features -->

## References

<!-- gen:begin arch-references -->
- [docs/SECURITY.md](docs/SECURITY.md) — security principles and implementation
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — reliability expectations
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
<!-- gen:end arch-references -->
