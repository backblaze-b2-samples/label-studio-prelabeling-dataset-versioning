<!-- last_verified: 2026-11-23 -->
# Feature: Dataset Library

## Purpose
The sample's own asset explorer, scoped to `labeling/`: pick a project and see its raw images, pre-label runs, annotations and releases without hunting through the whole bucket.

## Used By
- UI: `/library` (deep-linkable: `/library?project=<slug>&kind=prelabels&run=<run-id>`)
- API: `GET /projects/{slug}/assets?kind=raw|prelabels|annotations|exports&run=&release=&cursor=`

## Core Functions
- `service/library.py` — `assets`; `repo/b2_objects.py::list_page`
- `apps/web/src/components/library/library-browser.tsx`

## Outputs
- `AssetPage`: up to 100 items (key, size, last modified, group = run id or release name), `groups` on the page, `next_cursor`
- Raw images also carry `prelabel_status` (has a record in the latest run) and `annotation_status` (its task has an annotation in Label Studio)

## Flow
- Rows link to `/files?preview=<key>`, so preview and download stay in the bucket explorer (one implementation)
- A release's `manifest.json` row opens the manifest

## Edge Cases
- Invalid run id or release name in the query -> 400
- More than 100 objects -> Next / Previous page through continuation tokens

## Verification
- `services/api/tests/test_loop_routes.py::test_project_routes`

## Related Docs
- [File browser](file-browser.md)
