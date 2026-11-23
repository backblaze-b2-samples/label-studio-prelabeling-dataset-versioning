<!-- last_verified: 2026-11-23 -->
# Feature: Labeling Projects

## Purpose
Bind one Label Studio project to one raw-image prefix on B2, with Label Studio's own S3 source and target storage pointed at the B2 S3 endpoint, so annotators work in Label Studio while every byte stays in the bucket.

## Used By
- UI: `/projects` (list + "New project" dialog), `/projects/[slug]` (detail: Overview, Pre-label runs, Releases, Verification tabs; Edit dialog; danger zone)
- API: `GET/POST /projects`, `GET/PATCH/DELETE /projects/{slug}`, `POST /projects/{slug}/sync`, `GET /models`

## Core Functions
- `service/projects.py` — `create_project`, `update_project`, `delete_project`, `sync_project`, `get_detail`, `model_info`
- `service/descriptors.py` — the descriptor at `labeling/projects/<slug>.json` (the project's system of record; there is no database)
- `service/label_config.py` — the `<RectangleLabels>` labeling config
- `repo/label_studio.py` — Label Studio REST adapter (projects, S3 storages, syncs, ML backend registration)

## Canonical Files
- Pattern exemplar: `services/api/app/service/projects.py`, `apps/web/src/components/projects/project-create-dialog.tsx`

## Inputs
- `ProjectCreate`: `title` (free text), `description`, `labels` (subset of the model's label set), `threshold` (0.3 / 0.5 / 0.7 in the UI), `seed_sample_images` (bool)
- `ProjectUpdate`: `title`, `description`, `threshold` — labels are fixed after creation

## Outputs
- `LabelingProject` (slug, prefixes, Label Studio deep link), `ProjectDetail` (+ counts, latest run, latest release)
- Side effects on create: optional seed upload to `labeling/raw/<slug>/`, a Label Studio project, an S3 **target** storage on `labeling/annotations/<slug>`, an ML backend registration, an S3 **source** storage on `labeling/raw/<slug>` (now, or at the first sync if the prefix is still empty), then the descriptor

## Lifecycle (all five verbs are in the UI)
| Verb | Where | What happens |
|---|---|---|
| create | "New project" dialog on `/projects` | see Outputs |
| read | `/projects` list and the detail page | descriptor + live counts from B2 and Label Studio |
| edit | "Edit project" dialog | title/description (also patched in Label Studio), threshold for the next run |
| delete | detail page danger zone | deletes the Label Studio project and the descriptor; "Also delete this project's B2 data" (default off) purges every `labeling/*/<slug>/` object; typed-slug confirmation |
| run | detail page actions | Sync from B2, Run pre-labels, Sync annotations, Verify, Cut release, Open in Label Studio |

## Flow (create)
- Slug from the title (`^[a-z0-9][a-z0-9-]{1,47}$`); 409 if the descriptor exists
- Labels checked against `GET /info` on the ML backend and stored in model order
- Label Studio project created with `show_collab_predictions=true` and no live predictions; registering the ML backend makes Label Studio set `model_version` to the backend, which is reset to `""` so opening a task never calls the model
- Any failure after the Label Studio project exists deletes it again (no orphans)

## Edge Cases
- Empty raw prefix -> Label Studio refuses a source storage whose prefix has no object, so the source storage is created on the first sync that has something to import; sync on an empty prefix is a 409 with "Upload or seed images first"
- ML backend down -> `GET /models` and create answer 503 with a `docker compose up -d` hint
- Changing labels -> not offered: Label Studio rejects a config that drops labels existing annotations use

## UX States
- Empty: "No labeling projects yet"
- Loading: skeleton rows; create shows "Connecting Label Studio to B2…" (the first seed downloads the CC0 images once)
- Error: ErrorState with retry; create errors as a toast with the API's message

## Verification
- Test files: `services/api/tests/test_loop_services.py`, `test_loop_routes.py`, `test_http_clients.py`, `apps/web/src/lib/project-schema.test.ts`, `apps/web/e2e/projects.spec.ts`
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_loop_services.py -q`
- Default pre-PR verify command: `pnpm verify`
- Live: `pnpm test:live:loop` (Docker Compose + a B2 test bucket)

## Related Docs
- [Label Studio stack](label-studio-stack.md), [Pre-label runs](prelabel-runs.md), [Dataset releases](dataset-releases.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md), [docs/app-workflows.md](../app-workflows.md)
