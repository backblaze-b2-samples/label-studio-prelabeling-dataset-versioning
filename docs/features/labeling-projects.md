<!-- last_verified: 2026-11-24 -->
# Feature: Labeling Projects

## Purpose
Bind one Label Studio project to one raw-image prefix on B2, with Label Studio's own S3 source and target storage pointed at the B2 S3 endpoint, so annotators work in Label Studio while every byte stays in the bucket.

## Used By
- UI: `/projects` (list + "New project" dialog), `/projects/[slug]` (detail: Overview, Pre-label runs, Releases, Verification tabs; Edit dialog; danger zone)
- API: `GET/POST /projects`, `GET/PATCH/DELETE /projects/{slug}`, `POST /projects/{slug}/sync`, `GET /projects/{slug}/progress`, `GET /project-creates`, `GET /models`

## Core Functions
- `service/projects.py` — `create_project`, `list_creating`, `update_project`, `delete_project`, `sync_project`, `get_detail`, `model_info`
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
| run | detail page actions | Sync from B2, Run pre-labels, Sync annotations, Verify, Cut release, Open in Label Studio. The next step of the loop (derived from the counts by `nextLoopStep` in `apps/web/src/lib/project-next-step.ts`) is the solid primary button and is named in a persistent "Next: …" line under the actions. Once the latest release covers the current set (`releaseIsCurrent`: every task annotated, release images = tasks = raw images, cut from the latest pre-label run) the line reads "Done: release vN is on B2 — view its manifest" (links to the manifest preview) and no action is the primary |

## Flow (create)
- Slug from the title (`^[a-z0-9][a-z0-9-]{1,47}$`); 409 if the descriptor exists
- Labels checked against `GET /info` on the ML backend and stored in model order
- Label Studio project created with `show_collab_predictions=true` and no live predictions; registering the ML backend makes Label Studio set `model_version` to the backend, which is reset to `""` so opening a task never calls the model
- Any failure after the Label Studio project exists deletes it again (no orphans)
- Seeding reports each copied image to `repo/progress.py` (`ProjectProgress.seeding`); the dialog polls `GET /projects/{slug}/progress` with the slug it derives from the title and shows "Copying sample images to B2… N of 8" with a progress bar. A second create of the same slug while it seeds is a 409
- The whole create is also registered in `repo/progress.py` (`create`, with the title as `subject`), so a second create of the same slug is a 409 for its whole duration, and `GET /project-creates` lists the creates still running (seeding progress while images copy, else the Label Studio step). `/projects` polls it while any is running and shows "Creating <title>: Copying sample images to B2… N of 8" above the list, also after a reload, then refreshes the list when the create lands

## Edge Cases
- Empty raw prefix -> Label Studio refuses a source storage whose prefix has no object, so the source storage is created on the first sync that has something to import; sync on an empty prefix is a 409 with "Upload or seed images first"
- ML backend down -> `GET /models` and create answer 503 with a `docker compose up -d` hint; the dialog says so. If the browser gets no answer from the API at all (API down, or its CORS does not allow the page's origin) the dialog names the API URL and `API_CORS_ORIGINS` instead. The default allow-list covers `localhost` and `127.0.0.1` on ports 3000/3001
- Changing labels -> not offered: Label Studio rejects a config that drops labels existing annotations use

## UX States
- Empty: "No labeling projects yet"
- Loading: skeleton rows; create shows a spinner, the stages (copy the sample images, then connect Label Studio's storages and the ML backend) and the elapsed seconds; after 10s it explains the wait (the first seed downloads the CC0 images once). "Continue in background" (or Esc / clicking outside) closes the dialog without cancelling: a loading toast follows the create and turns into success (with "Open") or the error, even after navigating away
- Sync from B2 / Sync annotations: the button shows a spinner, "Syncing…" / "Syncing annotations…" and `aria-busy`, and a stage line names what Label Studio is doing and where ("Label Studio is scanning labeling/raw/<slug>/ on B2…", "Label Studio is writing annotations to labeling/annotations/<slug>/ on B2…") with the elapsed seconds; Label Studio reports no progress for its storage syncs, so there is no bar
- Verify: the button shows a spinner and "Verifying…" and every action is disabled while the report loads; the Verification tab shows a spinner with what is being compared
- Cut release dialog: while writing, a spinner on the submit, `aria-busy` on the form, and the step the server reports (`ProjectProgress.release`, polled) as "Step N of 8: <step>… Ns" with a progress bar
- Open in Label Studio: a hint under the actions names `LABEL_STUDIO_USERNAME` / `LABEL_STUDIO_PASSWORD` from `.env` for Label Studio's sign-in (never the values)
- Cut release dialog: a "Not ready to release yet" pre-check from the counts (no tasks, no pre-label run, N tasks not annotated) disables the submit; the server still re-verifies B2
- Error: ErrorState with retry; create errors as a toast with the API's message

## Verification
- Test files: `services/api/tests/test_loop_services.py`, `test_loop_routes.py`, `test_http_clients.py`, `apps/web/src/lib/project-schema.test.ts`, `project-next-step.test.ts`, `project-create-progress.test.ts`, `job-progress.test.ts`, `services/api/tests/test_progress.py`, `apps/web/e2e/projects.spec.ts`
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_loop_services.py -q`
- Default pre-PR verify command: `pnpm verify`
- Live: `pnpm test:live:loop` (Docker Compose + a B2 test bucket)

## Related Docs
- [Label Studio stack](label-studio-stack.md), [Pre-label runs](prelabel-runs.md), [Dataset releases](dataset-releases.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md), [docs/app-workflows.md](../app-workflows.md)
