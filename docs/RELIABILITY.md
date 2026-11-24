<!-- last_verified: 2026-11-24 -->
# Reliability

Reliability expectations and practices for this project.

## Health Checks

- `GET /health` verifies B2 connectivity and probes Label Studio (`/api/version/`) and the ML backend (`/info`) with 2-second timeouts; it returns `healthy` only when all three answer, else `degraded`
- Health endpoint is always available, even when B2, Label Studio or the ML backend is down; the web app's banner names which
- Compose healthchecks: Label Studio `curl /health` (60 s start period), ML backend `GET /health` (it answers while the model is still loading)
- The B2 client bounds connection attempts to 5 seconds, socket reads to 30
  seconds, and standard retries to 3 total attempts. Normal tests mock this
  boundary and deny network access; real connectivity is opt-in through
  `RUN_LIVE_B2_TESTS=1 pnpm test:live:b2`.

## Error Handling

- HTTP handlers return structured error responses with appropriate status codes
- External service failures are caught and surfaced: Label Studio or the ML backend unreachable -> 503 with a `docker compose up -d` hint; an error answer from either, or a B2 failure in the labeling flows -> 502 (`service/deps.py::upstream`, `runtime/errors.py`)
- Conflicts are 409s with a reason: duplicate project slug, release name already used (immutability), verification incomplete (the body lists the flagged tasks), cross-check mismatch, or a sync/run on a project with no images or tasks
- No unhandled exceptions leak stack traces to clients
- Uncaught exceptions are converted to a typed JSON 500 (`{"detail": "Internal server error"}`, modeled by `app.types.ErrorResponse`) by the catch-all in `timing_middleware`
- **Error responses carry CORS headers.** `CORSMiddleware` is registered LAST in `main.py` so it is the outermost middleware and wraps every response — including uncaught-exception 500s produced by the inner catch-all. This is intentional and load-bearing: if a 500 shipped without `Access-Control-Allow-Origin`, the browser would block it and the frontend would surface only an opaque "network error", hiding the real server bug. Regression-guarded by `tests/test_error_handling.py::test_unhandled_exception_500_carries_cors_headers`.

## Logging

- Structured JSON logging via Python stdlib
- Every request gets a `request_id` for tracing
- Log levels: ERROR for failures, WARNING for degraded state, INFO for requests

## Observability

- Request timing middleware logs duration for every request
- `/metrics` endpoint exposes basic Prometheus-format counters
- Upload success/failure counts tracked

## Stateful Counters — durability caveats

The download counter and the `/metrics` counters are **in-process, per replica**. Consequences to plan for before scaling:

- **Download counter** (`app/repo/counter.py`) persists to a JSON file at `DOWNLOAD_COUNT_FILE` (default `.data/download_count.json`, resolved from the repo root — deliberately outside `services/api/`, which `uvicorn --reload` watches, so a download never writes into the dev reloader's watch tree). On an ephemeral filesystem (Railway without a mounted volume or Vercel Functions) it **resets to 0 on every redeploy**. With multiple replicas or Function instances each keeps its own file/count. For durable, shared counts: mount a persistent volume or swap the adapter for Redis/DB.
- **Job progress** (`app/repo/progress.py`, behind `GET /projects/{slug}/progress` and `GET /project-creates`) lives in process memory: it survives a browser reload, not an API restart (the job's request dies with it anyway). With several replicas each knows only its own jobs, and the one-create-per-slug, one-pre-label-run and one-release-per-project guards are per replica; a shared store (Redis) is the swap-in.
- **`/metrics` counters** live in process memory and reset on restart. Behind a load balancer, each replica reports only its own slice — scrape with an instance label and aggregate, or push to a shared collector.

## Rate Limiting

- Per-IP fixed-window limiter (`app/runtime/ratelimit.py`); `RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_WRITE_PER_MINUTE` are the budgets. Rejected requests get `429` with a `Retry-After` header.
- Counters are in-process per replica; horizontal scaling needs a shared store (e.g. Redis) for a global limit.

## Graceful Degradation

- File listing returns empty list (not error) when B2 has no objects
- Metadata extraction failures don't block upload (return partial metadata)
- Frontend shows skeleton states while loading, error states on failure — and, for the bucket-listing waits that can run for seconds, on-screen copy that escalates instead of silent skeletons (`lib/loading-progress.ts`)
- A full bucket listing (needed by both `/files` and `/files/stats`) is cached, warmed at startup, and served **stale-while-revalidate**: after the first scan, an expired entry is returned immediately while a background thread refreshes it, so a slow or failing B2 list never turns into a user-visible 8-20s wait. `LIST_CACHE_TTL_SECONDS` (default 300) bounds staleness for changes made outside this app; the app's own uploads and deletes invalidate the cache outright. A failed background refresh keeps serving the previous snapshot and is logged
- `WARM_LIST_CACHE_ON_STARTUP=false` skips the startup scan (offline dev, or when startup must not touch B2)

## Annotation loop

- **Releases commit atomically by ordering.** `manifest.json` is written after
  the COCO file and the Label Studio export; a release without a manifest does
  not exist, so a crash mid-release leaves nothing half-committed. The next cut
  of that name overwrites the partial files.
- **Releases are immutable.** A second cut of an existing name is refused (B2
  has no conditional PUT, so this is a check-then-write: two simultaneous cuts of
  the same name are not prevented; run one release at a time per project).
- **Re-verification** re-reads every manifest file and recomputes sizes and
  sha256, so silent changes on B2 are detectable later.
- **Storage syncs run inside the Label Studio request** (no Redis in the compose
  stack); the API polls the storage status until it settles, with a 300 s cap,
  and the HTTP client allows 120 s per call (`LABEL_STUDIO_TIMEOUT_SECONDS`).
- **Pre-label runs** send tasks in batches of 4 (`PRELABEL_BATCH_SIZE`) with a
  300 s timeout per batch (`ML_BACKEND_TIMEOUT_SECONDS`). A run that fails
  midway leaves the records it wrote under its own run id; the next run gets a
  new id and becomes "latest", so partial runs never mix with complete ones.
- **Seed downloads** from Wikimedia Commons are paced and retried on HTTP 429
  with backoff, sha256-checked, and cached under `.data/seed-images/`.

## Deployment

- Local only: `docker compose up -d` for Label Studio and the ML backend, `pnpm dev` for the app. Restart policy `unless-stopped`.
- Label Studio data lives in the `label-studio-data` volume; `docker compose down -v` deletes it (and every Label Studio project). B2 keeps the descriptors, runs, annotations and releases.
- The kit's Railway/Vercel runbooks under `infra/` are not a supported path for this sample (see [ARCHITECTURE.md](../ARCHITECTURE.md#deployment)).
