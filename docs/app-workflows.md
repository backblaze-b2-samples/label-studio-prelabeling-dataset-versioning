<!-- last_verified: 2026-11-23 -->
# App Workflows

User journeys inside the application. The loop, in order: set up a project ->
sync from B2 -> pre-label -> correct in Label Studio -> sync annotations ->
verify -> cut a release.

## Set Up a Labeling Project

- Prerequisite: `docker compose up -d` (Label Studio + ML backend). The health banner names whichever is not reachable
- User opens `/projects` and clicks **New project**
- Title: free text, placeholder "Street scenes, batch 1"; the description under it shows the derived slug and the raw prefix `labeling/raw/<slug>/` live as the user types
- Labels: a checkbox group listing the model's own label set (from `GET /models`), with person, car, bicycle and bus pre-ticked; at least one is required. If the ML backend is down the group is replaced by a message naming `docker compose up -d`, and Create is disabled
- Threshold: segmented control 0.3 / 0.5 / 0.7, pre-selected from Settings (0.5 by default), with "0.5 is a sound default; lower adds more boxes to correct."
- Seed sample images: switch, on by default — "Copies the 8 CC0 sample images into this project's raw prefix."
- **Create project** shows a status line while Label Studio is wired to B2 (the first seed downloads the images from Wikimedia Commons once, so it can take a minute), then lands on the project page
- On the project page, **Sync from B2** turns every raw image into a Label Studio task; the toast reports tasks vs raw images and warns if they differ
- **Edit project** opens pre-filled (title, description, threshold); labels are shown read-only with the reason they are fixed
- **Delete project** (danger zone) asks for the slug to be typed; "Also delete this project's B2 data" is off by default
- See: [Labeling Projects](features/labeling-projects.md)

## Browse the Dataset Library

- User opens `/library` (or follows a link from a project or a run row, which pre-selects project, kind and run)
- Picks a project, then switches between Raw images, Pre-label runs, Annotations and Releases
- Pre-label runs and Releases add a run / release filter built from the groups present
- Raw images show "pre-labelled" / "annotated" badges; every row links to `/files?preview=<key>` for preview and download
- Next / Previous page through 100-object pages
- See: [Dataset Library](features/dataset-library.md)

## Upload Raw Images

- User opens `/upload` (a project page can link with `?project=<slug>`)
- Picks the project first; until then the dropzone is disabled with "Pick a project first"
- Drops JPEG, PNG or WebP files; anything else is rejected in the browser and again by the API
- Each image uploads straight to `labeling/raw/<project>/` on B2, with progress, then a verify step
- The note under the dropzone reminds: "Sync the project to turn new images into tasks."
- The queue survives navigation, and a reload mid-upload asks for confirmation
- See: [Raw Image Upload](features/file-upload.md)

## Browse the Bucket

- User opens `/files`: the kit's full-bucket explorer, unchanged — every object, not just `labeling/`
- Clicking a file opens its preview with metadata, Download and Delete
- `/files?preview=<key>` (used by the Library, release rows and the ⌘K palette) expands the folders and opens that preview
- See: [File Browser](features/file-browser.md)

## View Dashboard

- User opens `/`
- Stat cards: Projects, Tasks, Annotated tasks (with the percent annotated), Releases — summed across projects
- Recent releases: project, release, images, annotations (boxes), created; the project name links to its page
- If one project cannot be read (Label Studio down), an inline note says the totals are partial
- See: [Dashboard](features/dashboard.md)

## Change Preferences

- User opens `/settings`
- Theme applies on save (and the header toggle drives the same state)
- Default pre-label confidence threshold (0.3 / 0.5 / 0.7) pre-selects the New project form
- Default release format is shown read-only as COCO
- Services: the Label Studio and ML backend URLs and whether the API can reach them (from `/health`)
- See: [Settings](features/settings.md)

## Pre-label Tasks

- On a synced project, **Run pre-labels** sends every task to the local model at the project's threshold
- The toast reports the run id, boxes, tasks, duration and the device used (cpu in the default container)
- The run appears in the "Pre-label runs" tab and in the Library; Label Studio now shows these boxes as suggestions
- See: [Pre-label Runs](features/prelabel-runs.md)

## Correct in Label Studio

- **Open in Label Studio** opens the project (sign in with `LABEL_STUDIO_USERNAME` and the generated `LABEL_STUDIO_PASSWORD` from `.env`)
- Each task opens with the latest run's boxes; the annotator moves, relabels, deletes or adds boxes and submits
- Label Studio's target storage writes each submitted annotation to `labeling/annotations/<slug>/` on B2
- Back in the app, **Sync annotations** pushes any annotation not yet on B2 and reports the object count
- See: [Label Studio Stack](features/label-studio-stack.md)

## Verify a Project or Release

- **Verify** switches to the Verification tab and runs a live check: counts side by side and a table of flagged tasks with plain-language reasons and the fix for each
- On the Releases tab, **Re-verify** re-reads a release from B2 and lists each check (file sizes and sha256, COCO vs manifest, Label Studio export vs COCO)
- See: [Verification](features/verification.md)

## Cut a Dataset Release

- **Cut release** opens a dialog: name (placeholder `v<N+1>`, empty means that), optional notes
- If any task is flagged, the release is refused and the dialog lists exactly those tasks
- On success the toast names the prefix; the release appears on the Releases tab, the dashboard and the Library
- A release with the same name again is refused: releases are immutable
- See: [Dataset Releases](features/dataset-releases.md)
