<!-- last_verified: 2026-11-23 -->
# Feature: Raw Image Upload

## Purpose
Add raw images to a labeling project by uploading them straight from the browser to `labeling/raw/<project>/` on B2.

## Used By
- UI: `/upload` (`UploadForm`, `Dropzone`, `UploadProgress`, app-wide `UploadQueueProvider`)
- API: `POST /upload/presign` (`PresignUploadRequest` with a required `project`), `POST /upload/verify`

## Core Functions
- `services/api/app/service/upload.py` — `create_presigned_upload`, `verify_upload`, `ALLOWED_TYPES`
- `apps/web/src/lib/api-client.ts::uploadFile(file, project, onProgress)`
- `apps/web/src/lib/upload-file-types.ts` — dropzone allow-list (mirrors the backend)

## Inputs
- project: a project slug, picked from a required selector (`?project=<slug>` pre-selects it)
- files: `image/jpeg`, `image/png`, `image/webp` only, up to 100 MB each — exactly what Label Studio's source storage imports

## Outputs
- Objects at `labeling/raw/<project>/<sanitised filename>`
- A note under the dropzone: "Sync the project to turn new images into tasks."

## Flow
- Presign: the API checks the slug, that the project exists (404 otherwise), size, type and extension, mints the key and signs a PUT with the exact size and content type
- The browser PUTs to B2 (XHR, for progress); a CORS block names the bucket CORS fix
- Verify: HEAD + a ranged GET for the magic bytes; an invalid object is deleted

## Edge Cases
- No project picked -> the dropzone is disabled with "Pick a project first"
- Same filename twice -> same key; B2 keeps both versions
- Upload on a deployed origin -> run `setup_b2_cors.py --origin <origin> --apply`

## UX States
- Disabled (no project, or a queue in flight), uploading with progress, complete, error with retry

## Verification
- Test files: `services/api/tests/test_upload_validation.py`, `test_upload_conflict.py`, `apps/web/src/lib/upload-file-types.test.ts`, `apps/web/src/lib/api-client.test.ts`
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_upload_validation.py -q`

## Related Docs
- [Labeling projects](labeling-projects.md), [File browser](file-browser.md)
