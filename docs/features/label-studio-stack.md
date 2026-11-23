<!-- last_verified: 2026-11-23 -->
# Feature: Label Studio Stack

## Purpose
Run Label Studio Community Edition and the sample's ML backend locally with one command, wired to B2 without any proxy or patch.

## Services (`docker-compose.yml`)
| Service | Image | Port | Notes |
|---|---|---|---|
| `label-studio` | `heartexlabs/label-studio:1.23.2` (pinned) | `127.0.0.1:8080` | data in the `label-studio-data` volume |
| `ml-backend` | built from `services/ml-backend/` (`label-studio-prelabeling-dataset-versioning-ml-backend`) | `127.0.0.1:9090` | CPU-only torch; model cache in `model-cache` |

## Label Studio settings this sample relies on (checked against the 1.23.2 source)
| Env | Why |
|---|---|
| `LABEL_STUDIO_USERNAME` / `LABEL_STUDIO_PASSWORD` / `LABEL_STUDIO_USER_TOKEN` | bootstrap admin on first start; the token is set as that user's API token |
| `LABEL_STUDIO_ENABLE_LEGACY_API_TOKEN=true` | 1.23 creates new organizations with legacy tokens disabled (JWT flag on); this supported switch keeps `Authorization: Token <token>` valid |
| `LABEL_STUDIO_DISABLE_SIGNUP_WITHOUT_LINK=true` | no self sign-up |
| `ML_BLOCK_LOCAL_IP=false` | the ML backend's compose address is private; Label Studio's SSRF guard blocks it otherwise. Storage SSRF protection stays on (B2 is public) |
| `AWS_SDK_UA_APP_ID=b2ai-label-studio-annotation-loop` | botocore appends `app/b2ai-label-studio-annotation-loop` to Label Studio's own S3 client User-Agent |

## Storage wiring
- Source: `POST /api/storages/s3/` — prefix `labeling/raw/<slug>`, `regex_filter=(?i)^.*\.(jpe?g|png|webp)$`, `use_blob_urls`, `presign` (15 min), `recursive_scan`, `region_name=B2_REGION`, `s3_endpoint=https://s3.<B2_REGION>.backblazeb2.com`
- Target: `POST /api/storages/export/s3` — prefix `labeling/annotations/<slug>`. 1.23.2 writes one object per annotation at `<prefix>/<annotation id>` (no extension, no doubled `/` because the prefix is sent without a trailing slash); the body is the annotation with its task nested
- Images load in the labeling UI from presigned B2 URLs, so the bucket CORS must allow the Label Studio origin for GET/HEAD (`setup_b2_cors.py` adds that rule)

## ML backend (`services/ml-backend/`)
- FastAPI, no `label-studio-ml` SDK: `GET /health`, `POST /setup`, `POST /predict`, plus `GET /info`
- Reads task images from B2 with its own boto3 client (`user_agent_extra=b2ai-label-studio-annotation-loop`)
- Device: CUDA -> MPS -> CPU, override with `TORCH_DEVICE`; inside the Linux container MPS never exists

## Edge Cases
- First `docker compose up` pulls Label Studio and builds the backend; the model (about 80 MB) downloads on first start into the cache volume
- Changing the token after first start does not update the stored one: `docker compose down -v` resets Label Studio's data (and its projects)

## Verification
- `pnpm run doctor` warns when either service is not answering
- `pnpm test:live:loop` drives both for real

## Related Docs
- [docs/SECURITY.md](../SECURITY.md), [Labeling projects](labeling-projects.md)
