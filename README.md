<!-- last_verified: 2026-11-23 -->
<!-- gen:begin readme-header -->
# Label Studio Prelabeling Dataset Versioning

Pre-label, correct and release datasets with Label Studio on B2. Connects Label Studio to Backblaze B2 as source and target storage, pre-labels tasks with a local model, and exports versioned, verified dataset releases back to the same bucket.

Built for developers and AI coding agents: the scaffolding, the storage
wiring and the agent-facing docs are already done, so you start on your
app's own features instead of rebuilding the same shell. Storage is
**[Backblaze B2](https://www.backblaze.com/sign-up/ai-cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-label-studio-annotation-loop)**, integrated through the S3-compatible API.

**What you get out of the box:**
- Full-stack dashboard UI (Next.js 16, React 19, Tailwind v4, shadcn/ui, TanStack Query)
- Labeling Projects — create, edit, delete and run projects bound to Label Studio source and target storage on B2
- Pre-label Runs — local object detector writes versioned suggestions to B2 and into Label Studio
- Dataset Releases — immutable COCO releases with a manifest, written back to B2
- Verification — compare tasks, pre-labels, annotations and release files, and flag missing labels
- Dataset Library — browse raw images, pre-label runs, annotations and releases per project
- Raw Image Upload — upload raw images straight to a project's B2 prefix
- File Browser — browse, preview, download and delete any object in the bucket
- Dashboard — projects, tasks, annotated tasks, releases and recent releases
- Settings — theme, default pre-label threshold and service status
- Metadata Extraction — image dimensions, EXIF and checksums in the bucket explorer
- Label Studio Stack — Docker Compose with Label Studio and the ML backend
- Backend with a strict layered architecture and structural tests (FastAPI, Python 3.12+, boto3, httpx, Pydantic v2, Pillow)
- Agent-optimized docs — your AI coding agent can read the repo and start contributing immediately
<!-- gen:end readme-header -->

<!-- gen:begin readme-screenshots -->

<!-- gen:end readme-screenshots -->

**The problem.** Annotators label every image from scratch, and raw data, model
suggestions and final labels end up in different places, so nobody can rebuild
or audit a training set later.

**Who it is for.** Data providers and physical AI teams who run Label Studio and
need versioned, auditable training data releases.

**What it does.**
- Syncs raw images from a B2 prefix into Label Studio as labeling tasks
- Pre-labels every task with a local object detection model and saves each run to B2
- Writes corrected annotations back to B2 through Label Studio target storage
- Exports an immutable COCO dataset release with a manifest of every task, pre-label and annotation
- Flags any task that has no annotation before a release is cut

**Where B2 fits.** One bucket holds raw images, pre-label runs, annotations and
releases, so any release can be rebuilt and audited from storage alone.
Label Studio's own S3 source and target storage point straight at the B2 S3
endpoint: no proxy, no fork, no patch.

## Quick Start

You need: Node.js >= 20, pnpm >= 10, Python >= 3.12, Docker (Compose v2), and a
free **[Backblaze B2 account](https://www.backblaze.com/sign-up/ai-cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-label-studio-annotation-loop)**.
Everything runs on your machine; nothing is hosted.

```bash
git clone https://github.com/backblaze-b2-samples/label-studio-prelabeling-dataset-versioning.git
cd label-studio-prelabeling-dataset-versioning
pnpm run setup      # .env from .env.example, generates the Label Studio token + password, installs deps
```

### Setup

<!-- gen:begin readme-credentials -->
1. **Create a bucket** and an **application key** with `Read and Write`
   permission, then paste each value into `.env`:
   - `B2_APPLICATION_KEY_ID` — B2 application key ID (**keyID** in the B2 console)
   - `B2_APPLICATION_KEY` — B2 application key (**applicationKey**), shown once at creation
   - `B2_BUCKET_NAME` — bucket unique name (**Bucket Unique Name** in the B2 console)
   - `B2_REGION` — the region inside the bucket's **Endpoint** (`s3.<region>.backblazeb2.com`); the S3 endpoint is derived from it
   - `LABEL_STUDIO_API_TOKEN` — API token for the bootstrap admin; `pnpm setup` generates it and Docker Compose passes it to Label Studio

   B2 shows an application key once, at creation. The optional variables are
   documented in `.env.example` and in the delivery runbooks.
<!-- gen:end readme-credentials -->

2. **Allow the browser and Label Studio to read the bucket** (uploads PUT from
   the web app; the labeling UI loads each image from a presigned B2 URL):

   ```bash
   services/api/.venv/bin/python services/api/scripts/setup_b2_cors.py --origin http://localhost:3000 --origin http://127.0.0.1:3000 --apply
   ```

   It merges two rules into the bucket's CORS: the web origin (GET/PUT/HEAD) and
   the Label Studio origin `http://localhost:8080` (GET/HEAD only).

3. **Start Label Studio and the ML backend**, then the app:

   ```bash
   docker compose up -d   # first run pulls Label Studio 1.23.2 and builds the model server
   pnpm dev               # web on :3000, API on :8000
   ```

   `pnpm run doctor` (run by `pnpm dev`) warns until both containers answer.
   The model (about 80 MB) downloads into a cache volume on the first start.

4. **Run the loop**: open <http://localhost:3000/projects>, create a project
   (keep "Seed sample images" on), then on the project page: **Sync from B2** ->
   **Run pre-labels** -> **Open in Label Studio** (sign in with
   `LABEL_STUDIO_USERNAME` and the generated `LABEL_STUDIO_PASSWORD` from
   `.env`), correct and submit each task -> **Sync annotations** -> **Verify** ->
   **Cut release**.

Use a B2 application key restricted to a test bucket: Label Studio stores the
key it is given in its local database volume (see [docs/SECURITY.md](docs/SECURITY.md)).

## How it works

```
            B2 bucket (S3-compatible API)
  labeling/raw/<project>/             <- Label Studio source storage (read)
  labeling/prelabels/<project>/<run>/ <- API writes one JSON per task per run
  labeling/annotations/<project>/     <- Label Studio target storage (write)
  labeling/exports/<project>/<rel>/   <- API writes COCO + manifest, immutable
  labeling/projects/<project>.json    <- project descriptor
        ^            ^             ^
   Label Studio   ML backend     FastAPI API  <-- Next.js web app
   (:8080)        (:9090)        (:8000)          (:3000)
```

- **Projects** (`/projects`): create, read, edit, delete and run. Creating one
  makes a Label Studio project with an S3 source storage on
  `labeling/raw/<slug>` and an S3 target storage on `labeling/annotations/<slug>`.
- **Pre-label runs**: every task goes to the local detector; one JSON per task
  lands under `labeling/prelabels/<slug>/<run-id>/` and the same boxes become
  Label Studio predictions, so annotators only correct.
- **Releases**: COCO built from the annotation objects on B2 (not from Label
  Studio), cross-checked against Label Studio's own export, with a
  `manifest.json` (sha256 per file) written last. A release is never rewritten.
- **Verification**: raw objects vs tasks vs pre-labels vs annotations, with
  every gap flagged; a release is refused until nothing is flagged.
- **Library** (`/library`) browses one project's `labeling/` assets; the kit's
  bucket explorer (`/files`) still shows the whole bucket.

## Label Studio version and API token

- Image: `heartexlabs/label-studio:1.23.2` (current stable on 2026-11-23, amd64 and arm64), pinned in `docker-compose.yml`.
- Token method: **legacy token, enabled through the supported setting.** Label
  Studio 1.23 ships with JWT tokens on and creates new organizations with legacy
  tokens disabled. Compose sets `LABEL_STUDIO_ENABLE_LEGACY_API_TOKEN=true`, so
  the bootstrap token (`LABEL_STUDIO_USER_TOKEN`, from `LABEL_STUDIO_API_TOKEN`
  in `.env`) authenticates `Authorization: Token <token>`. Verified by reading
  the 1.23.2 source (`organizations/functions.py::create_organization`,
  `jwt_auth/auth.py::TokenAuthenticationPhaseout`, `server.py::_create_user`),
  not yet against a running container.
- Target storage writes one object per annotation at
  `labeling/annotations/<slug>/<annotation id>` (no extension; the body is the
  annotation with its task nested). Verification also reads the per-task shape
  Label Studio writes when `FUTURE_SAVE_TASK_TO_STORAGE=true`.

## Model and image licenses

| Component | Source | License |
|---|---|---|
| RT-DETR R18 detector | [`PekingU/rtdetr_r18vd_coco_o365`](https://huggingface.co/PekingU/rtdetr_r18vd_coco_o365) @ `386c43855d01bcd966e548f3296fbd2cd2a2a40b` (pinned) | Apache-2.0 (model card `license: apache-2.0`, not gated) |
| Label Studio Community Edition | [HumanSignal/label-studio](https://github.com/HumanSignal/label-studio) 1.23.2 | Apache-2.0 |

Runs on CPU by default (device auto-detect: CUDA, then Apple MPS, then CPU).
Ultralytics YOLO models were excluded (AGPL-3.0).

Seed images: eight street scenes from Wikimedia Commons, each **CC0**, checked
through the Commons API (`extmetadata.LicenseShortName`) on 2026-11-23 and pinned
with URL, sha256, author and source page in
[`services/api/seed/images.json`](services/api/seed/images.json). They are
downloaded at run time (descriptive user agent, paced, sha256-checked); no image
binaries are committed. Each gave at least one detection at threshold 0.5 with
the pinned model (counts below are for the default labels):

| File | Source | Author | License | Detections at 0.5 |
|---|---|---|---|---|
| `floating-bus-stop.jpg` | [Floating Bus Stop.jpg](https://commons.wikimedia.org/wiki/File:Floating_Bus_Stop.jpg) | Camden Cyclists | CC0 | car 4 |
| `hanoi-street-foot-traffic.jpg` | [Hanoi Street Foot Traffic.jpg](https://commons.wikimedia.org/wiki/File:Hanoi_Street_Foot_Traffic.jpg) | Arnaud Matar | CC0 | person 11 |
| `people-gathering-at-the-corner-of-coventry-stree.jpg` | [People gathering at the corner of Coventry Street and Great Windmill street, London - 1947.jpg](https://commons.wikimedia.org/wiki/File:People_gathering_at_the_corner_of_Coventry_Street_and_Great_Windmill_street,_London_-_1947.jpg) | Willem van de Poll | CC0 | person 11 |
| `route-66-at-launceston-street-bus-stop-2026.jpg` | [Route 66 at Launceston Street bus stop 2026.jpg](https://commons.wikimedia.org/wiki/File:Route_66_at_Launceston_Street_bus_stop_2026.jpg) | Totallynotarandomalt69 | CC0 | person 1, bus 1 |
| `1985-boys-regulating-traffic-at-chiang-rai-road.jpg` | [1985. Boys regulating traffic at Chiang Rai road junction. Archiv Spielvogel.JPG](https://commons.wikimedia.org/wiki/File:1985._Boys_regulating_traffic_at_Chiang_Rai_road_junction._Archiv_Spielvogel.JPG) | Spielvogel | CC0 | person 6, car 5, bicycle 1 |
| `bus-stop-bypass-outside-stable-market.jpg` | [Bus stop bypass outside Stable Market.jpg](https://commons.wikimedia.org/wiki/File:Bus_stop_bypass_outside_Stable_Market.jpg) | Camden Cyclists | CC0 | person 3, bicycle 1 |
| `bus-stop-outside-haverstock-school.jpg` | [Bus stop outside Haverstock School.jpg](https://commons.wikimedia.org/wiki/File:Bus_stop_outside_Haverstock_School.jpg) | Camden Cyclists | CC0 | person 3, bus 1 |
| `traffic-jam-at-the-entrance-into-korolev.jpg` | [Traffic jam - at the entrance into Korolev.jpg](https://commons.wikimedia.org/wiki/File:Traffic_jam_-_at_the_entrance_into_Korolev.jpg) | Sergey Tchernyakov | CC0 | person 1, car 11 |

## B2 standards audit

| Standard | Status |
|---|---|
| S3-compatible API only | Yes. No b2-native calls anywhere (API, ML backend, Label Studio storages) |
| Custom user agent on every S3 client | API and ML backend: `user_agent_extra="b2ai-label-studio-annotation-loop"`. Label Studio's own client: `AWS_SDK_UA_APP_ID=b2ai-label-studio-annotation-loop`; with Label Studio 1.23.2's bundled botocore 1.39.3 and its exact client construction, the captured header ends `... app/b2ai-label-studio-annotation-loop Botocore/1.39.3` (captured on the host, not inside the container) |
| `B2_*` env names | `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_REGION`, `B2_PUBLIC_URL_BASE` (optional). The endpoint is always derived: `https://s3.<B2_REGION>.backblazeb2.com` |
| Attribution on links | every backblaze.com link carries `utm_content=b2ai-label-studio-annotation-loop` |

## Correctness evidence

What was actually run while building this sample (2026-11-23, macOS arm64):

| Check | Result |
|---|---|
| `pnpm verify` (agent-docs, API lint + tests + structure + ML backend tests, generator drift, web lint, typecheck, unit tests, build) | green: agent-docs 124 checks; API 212 tests + 5 structure; ML backend 14; web 189 tests; `next build` OK. Run with Node 22 and Python 3.15 (the only 3.12+ interpreter on the build machine; CI pins 3.12) |
| Playwright `pnpm test:e2e` (project create with the API mocked) | 4 passed |
| Annotation loop through the service layer with B2 / Label Studio / ML faked (`test_loop_services.py`) | 3 tasks -> 3 pre-label records -> release refused with exactly the unannotated task flagged -> release `v1`: 3 images, 4 boxes (2 corrected, 1 added) -> re-cut 409 -> a tampered COCO file fails re-verification |
| Real model through the ML backend's `/predict` route (B2 read stubbed with the local seed files), CPU | 4 seed images: 4 / 11 / 11 / 2 boxes after label filtering (car; person; person; bus + person); MPS when run natively |
| Label Studio's S3 client user agent with `AWS_SDK_UA_APP_ID` (botocore 1.39.3) | `app/b2ai-label-studio-annotation-loop` present |
| **Live loop** `pnpm test:live:loop` (Docker Compose + B2 test bucket) | **Not run.** Docker and B2 credentials were not available on the build machine. The test is written and opt-in; its run writes the real counts to `.data/live-loop-evidence.json` — copy them here after the first run |

The live loop asserts: tasks equal raw objects after sync; one pre-label object
per task; the release is refused with exactly the one unannotated task flagged;
every task has a pre-label, an annotation object and a COCO image entry; the
COCO annotation count equals the sum of annotation boxes; Label Studio's export
and COCO agree; every manifest file exists on B2 with matching size and sha256;
a second cut of the same release is refused. It cleans up with `purge_b2=true`.

## Human validation checklist

- [ ] `docker compose up -d`, then `pnpm dev`; the health banner disappears
- [ ] Create a project with the 8 sample images; **Sync from B2** reports 8 tasks for 8 images
- [ ] **Run pre-labels**; the run shows on the "Pre-label runs" tab and in the Library
- [ ] **Open in Label Studio**: tasks show the suggested boxes; move one, delete one, add one, submit a few tasks
- [ ] Back in the app, **Cut release** is refused and lists the tasks you did not label
- [ ] Label the rest, **Sync annotations**, **Verify** shows `complete`
- [ ] **Cut release**; the files appear under `labeling/exports/<project>/<release>/` in the Library and in the bucket explorer (`/files`)
- [ ] **Re-verify** the release: every check passes; the manifest counts your corrections

## When to use

- You run Label Studio and want raw data, model suggestions, annotations and
  releases in one bucket you control
- You need a release you can rebuild and audit later from storage alone
- You want pre-labels from a local, license-clean model with no API cost

## When not to use

- Multi-user labeling teams with SSO, roles or review queues: this sample runs a
  single local admin and does not cover them
- Hosting Label Studio for others: it is local-only by design
- Active learning or model training: out of scope

## Tech Stack

- TypeScript, Next.js 16, React 19, Tailwind v4, shadcn/ui, TanStack Query
- Python 3.12+, FastAPI, boto3, httpx, Pydantic v2, Pillow
- Label Studio Community Edition 1.23.2 (Docker)
- ML backend: FastAPI, PyTorch 2.15 (CPU wheels in the image), transformers 5.24, RT-DETR R18
- Backblaze B2 (S3-compatible object storage)
- pnpm workspaces (monorepo)

## Core Features

<!-- gen:begin readme-core-features -->
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
<!-- gen:end readme-core-features -->

## Commands

The commands you reach for day to day:

<!-- gen:begin readme-commands -->
| Command | What it does |
| --- | --- |
| `pnpm run setup` | One-time cold start: copy `.env.example` → `.env` (only if missing), install workspace deps, create the backend venv, install locked API deps |
| `pnpm dev` | Start frontend + backend (runs the `pnpm run doctor` preflight first) |
| `pnpm wait-ready` | Block until the running web + API answer, print one line, exit 0/1 — use instead of sleeping before driving the app |
| `pnpm contract:export` | Export the FastAPI OpenAPI contract into `docs/api/openapi.json` |
| `pnpm contract:check` | Verify the exported contract and the generated client routes agree, both ways |
| `pnpm gen:api` | Regenerate the shared types, the client route registry and the query-key factory from the exported contract |
| `pnpm gen:docs` | Regenerate the marker-delimited doc regions from `docs/exec-plans/sample.json` |
| `pnpm gen:check` | Fail if any generated file or doc region is stale (first step of `pnpm verify:web`) |
| `pnpm verify` | Credential-free pre-PR suite — runs `check:agent-docs`, `verify:api`, then `verify:web` |
| `pnpm verify:full` | `pnpm verify` plus Playwright E2E; needs a live local stack, real `.env`, a free web port, and Chromium |
| `pnpm test:verify` | Run throwaway verification specs from `apps/web/e2e/verify/` against the app, with the shared browser fixtures |
<!-- gen:end readme-commands -->

Sample-specific: `docker compose up -d` (Label Studio + ML backend),
`pnpm test:ml` (ML backend unit tests, part of `pnpm verify:api`),
`pnpm test:live:loop` (the live end-to-end loop; needs Compose and a B2 test
bucket), and `services/api/.venv/bin/python services/api/scripts/seed_images.py --project <slug>`.

`pnpm verify` is the gate to run before opening a PR. It needs
`services/api/.venv` from `pnpm run setup`, but no B2 credentials, Docker or
browser, and it breaks down into `pnpm verify:api` (backend lint, tests,
structure, ML backend tests), `pnpm verify:web` (frontend lint, unit tests,
typecheck + build), and `pnpm check:agent-docs` (agent-doc drift).

For the full command reference see [docs/dev-workflows.md](docs/dev-workflows.md#commands);
for gates and recovery see [docs/verification.md](docs/verification.md).

## Deployment

This sample runs locally. Label Studio must run beside the app and stores your
B2 key in its database, so it ships no hosted deployment.

<!-- gen:begin readme-deploy-button -->
_This app does not ship a one-click deploy button._
<!-- gen:end readme-deploy-button -->

## Documentation Map

<!-- gen:begin readme-doc-map -->
| Doc | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Agent table of contents — start here |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System layout, layering, data flows |
| [docs/features/](docs/features/) | Feature docs (labeling projects, pre-label runs, dataset releases, verification, dataset library, raw image upload, file browser, dashboard, settings, metadata extraction, label studio stack) |
| [docs/design-system.md](docs/design-system.md) | Design tokens, primitives, loader, error/empty states |
| [docs/app-workflows.md](docs/app-workflows.md) | User journeys |
| [docs/dev-workflows.md](docs/dev-workflows.md) | Engineering workflows, command index, releases |
| [docs/verification.md](docs/verification.md) | What each gate checks, and failure recovery |
| [docs/frontend-conventions.md](docs/frontend-conventions.md) | Frontend conventions, screens, data fetching |
| [docs/SECURITY.md](docs/SECURITY.md) | Security principles |
| [docs/RELIABILITY.md](docs/RELIABILITY.md) | Reliability expectations |
| [docs/api/openapi.json](docs/api/openapi.json) | The checked-in API contract the client seam is generated from |
| [docs/exec-plans/](docs/exec-plans/) | Execution plans, tech debt, and the sample manifest |
<!-- gen:end readme-doc-map -->

## FAQ

**Does this patch or proxy Label Studio?**
No. Label Studio's own S3 source and target storages point at the B2 S3
endpoint. The app only configures them over Label Studio's REST API.

**Why COCO from B2 and not from Label Studio's export?**
So a release depends only on what is in the bucket. Label Studio's export is
saved beside it and must agree, or the release is refused.

**Can I use a GPU?**
The ML backend picks CUDA when available, MPS when run natively on a Mac, and CPU
otherwise. The default image installs CPU-only PyTorch.

**Where do I get help or report bugs?**
Report repository defects through [GitHub Issues](https://github.com/backblaze-b2-samples/label-studio-prelabeling-dataset-versioning/issues).
For B2 account or API help, use [Backblaze Support](https://www.backblaze.com/help).

## Maintenance and support

Backblaze maintains this open-source sample to help developers get started with
B2. It carries no SLA; production use needs your own validation.
Learn more about [Backblaze B2 Cloud Storage](https://www.backblaze.com/cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-label-studio-annotation-loop).

## Contributing

Start with [AGENTS.md](AGENTS.md). For local commit hooks, follow [the pre-commit workflow](docs/verification.md#pre-commit).

## License

MIT License - see [LICENSE](LICENSE) for details. Label Studio, the model and
the seed images keep their own licenses (above).
