import type {
  AnnotationSyncResult,
  AssetPage,
  DashboardSummary,
  DatasetRelease,
  DeleteFileResponse,
  FileMetadata,
  FileMetadataDetail,
  FileUploadResponse,
  FileUrlResponse,
  FlaggedTask,
  HealthStatus,
  LabelingProject,
  ModelInfo,
  PrelabelRun,
  PrelabelRunCreate,
  PresignUploadResponse,
  ProjectCreate,
  ProjectCreating,
  ProjectDeleted,
  ProjectDetail,
  ProjectProgress,
  ProjectUpdate,
  ReleaseCreate,
  SyncResult,
  UploadStats,
  VerificationReport,
} from "@label-studio-prelabeling-dataset-versioning/shared";

import { API_CLIENT_ROUTES } from "./generated/api-routes";

// The route registry is GENERATED from the API contract (`pnpm gen:api`), so
// it cannot drift from FastAPI. Re-exported from here because this module is
// the frontend's API surface: consumers and the contract test import it from
// `lib/api-client`, and that import path should not change just because the
// registry moved behind a generator.
//
// Everything else in this file is hand-written on purpose — error policy, base
// URL resolution, the legacy-route fallback, the CORS diagnostics and the XHR
// upload transport are per-app judgement the contract does not describe. See
// `scripts/gen/api-gen.config.json` (`escapeHatch`).
export { API_CLIENT_ROUTES };

// Single-origin deploys (Vercel `services`: one project serving web + API) put
// the API under /api on the same origin, so no NEXT_PUBLIC_API_URL is needed —
// a production build with it unset defaults to the relative "/api". An explicit
// NEXT_PUBLIC_API_URL still wins (two-project / separate-origin deploys). Local
// dev (NODE_ENV !== "production") falls back to the dev API port.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8000");

/** Typed API error with HTTP status code for caller-side branching. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Tasks that block a release (409 `ReleaseBlocked` bodies only). */
    public readonly flagged: FlaggedTask[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True for 408, 429, 500, 502, 503, 504 — worth retrying. */
  get isRetryable(): boolean {
    return [408, 429, 500, 502, 503, 504].includes(this.status);
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

/**
 * Build the right status-0 ApiError for a thrown fetch().
 *
 * fetch() rejects with a TypeError for genuinely-offline/DNS failures AND for
 * responses the browser refused to expose — most notably a cross-origin 500
 * that shipped without `Access-Control-Allow-Origin`. We can't tell those apart
 * from the error object, but `navigator.onLine === false` reliably means the
 * device has no connectivity. Anything else reached the network, so the most
 * likely cause is the server erroring with a CORS-blocked response — point the
 * developer at the API logs instead of blaming their connection.
 */
function networkError(): ApiError {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new ApiError("You appear to be offline — check your connection", 0);
  }
  return new ApiError(
    "Couldn't reach the API, or the server returned an error the browser blocked (CORS). Check the API logs.",
    0,
  );
}

/**
 * Build the status-0 ApiError for a failed browser→B2 PUT.
 *
 * Deliberately not `networkError()`: these bytes never touch the API, so
 * "check the API logs" sends the developer to the one place that looks fine —
 * the presign that produced this URL succeeded and logged a clean 200.
 *
 * The overwhelmingly likely cause is that the *bucket's* CORS does not allow
 * this page's origin (locally: the README setup step was skipped; deployed: a
 * new origin), so the browser blocks the PUT before it leaves and XHR reports
 * only a contentless `error` event. Name the cause and the exact command for
 * the current origin instead of leaving a mystery.
 */
export function storageNetworkError(origin?: string): ApiError {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new ApiError("You appear to be offline — check your connection", 0);
  }
  const here =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "<your origin>");
  return new ApiError(
    `Couldn't upload to B2 storage: the bucket's CORS must allow ${here}. Run ` +
      "services/api/.venv/bin/python services/api/scripts/setup_b2_cors.py " +
      `--origin ${here} --apply, then retry.`,
    0,
  );
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw networkError();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      typeof body.detail === "string" ? body.detail : `API error: ${res.status}`,
      res.status,
      Array.isArray(body.flagged) ? body.flagged : [],
    );
  }
  return res.json();
}

/** Fill `{slug}`-style path parameters from the generated route registry. */
export function routePath(
  path: string,
  params: Record<string, string>,
  query?: Record<string, string | undefined>,
): string {
  const filled = path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (!value) throw new ApiError(`Missing route parameter: ${name}`, 400);
    return encodeURIComponent(value);
  });
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${filled}?${qs}` : filled;
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method: method.toUpperCase(),
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function isEndpointUnavailable(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 404 &&
    (error.message === "Not Found" || error.message === "API error: 404")
  );
}

async function apiFetchWithLegacyFallback<T>(
  path: string,
  legacyPath: () => string,
  init?: RequestInit
): Promise<T> {
  try {
    return await apiFetch<T>(path, init);
  } catch (error) {
    if (isEndpointUnavailable(error)) {
      return apiFetch<T>(legacyPath(), init);
    }
    throw error;
  }
}

function fileKeyQuery(key: string): string {
  if (key.length === 0) {
    throw new ApiError("File key is required", 400);
  }
  return new URLSearchParams({ key }).toString();
}

function legacyFileKeyPath(
  key: string,
  options: { blockRouteCollisions?: boolean } = {}
): string {
  if (!isLegacyPathFallbackSafe(key, options)) {
    throw new ApiError("Current API version required for this file key", 404);
  }
  return encodeURIComponent(key);
}

/**
 * Substitute a file key into a legacy `{key}` path template. The parameter type
 * requires the literal `{key}` placeholder, so passing a registry path that has
 * no placeholder is a compile error rather than a silent no-op that would send
 * the request to a keyless URL.
 */
function legacyFileKeyRoute(
  path: `${string}{key}${string}`,
  key: string,
  options: { blockRouteCollisions?: boolean } = {}
): string {
  return path.replace("{key}", legacyFileKeyPath(key, options));
}

function isLegacyPathFallbackSafe(
  key: string,
  { blockRouteCollisions = false }: { blockRouteCollisions?: boolean } = {}
): boolean {
  if (/(\.\.\/|\/\.\.|\\|%2e%2e|%00|\x00)/i.test(key)) return false;
  if (!blockRouteCollisions) return true;

  const lowerKey = key.toLowerCase();
  if (lowerKey === "stats" || lowerKey === "stats/activity") return false;
  if (lowerKey.endsWith("/download") || lowerKey.endsWith("/preview")) return false;
  return true;
}

export async function getHealth() {
  return apiFetch<HealthStatus>(API_CLIENT_ROUTES.health.path);
}

export async function getFiles(prefix = "", limit = 100) {
  return apiFetch<FileMetadata[]>(
    `${API_CLIENT_ROUTES.files.path}?prefix=${encodeURIComponent(prefix)}&limit=${limit}`
  );
}

export async function getFileStats() {
  return apiFetch<UploadStats>(API_CLIENT_ROUTES.fileStats.path);
}

export async function getFile(key: string) {
  return apiFetchWithLegacyFallback<FileMetadata>(
    `${API_CLIENT_ROUTES.fileByKeyMetadata.path}?${fileKeyQuery(key)}`,
    () =>
      legacyFileKeyRoute(API_CLIENT_ROUTES.legacyFileMetadata.path, key, {
        blockRouteCollisions: true,
      })
  );
}

/**
 * Rich metadata (checksums, image/PDF fields) for an already-stored file.
 * The server recomputes this on demand by downloading the object, so it's a
 * heavier call than getFile — fetch it lazily (only when the user asks to see
 * details). No legacy path fallback: this endpoint is new, so an older backend
 * wouldn't serve it under any route.
 */
export async function getFileDetail(key: string) {
  return apiFetch<FileMetadataDetail>(
    `${API_CLIENT_ROUTES.fileByKeyDetail.path}?${fileKeyQuery(key)}`
  );
}

export async function getDownloadUrl(key: string) {
  return apiFetchWithLegacyFallback<FileUrlResponse>(
    `${API_CLIENT_ROUTES.fileByKeyDownload.path}?${fileKeyQuery(key)}`,
    () => legacyFileKeyRoute(API_CLIENT_ROUTES.legacyFileDownload.path, key)
  );
}

/** Preview-only presigned URL — does NOT increment the download counter. */
export async function getPreviewUrl(key: string) {
  return apiFetchWithLegacyFallback<FileUrlResponse>(
    `${API_CLIENT_ROUTES.fileByKeyPreview.path}?${fileKeyQuery(key)}`,
    () => legacyFileKeyRoute(API_CLIENT_ROUTES.legacyFilePreview.path, key)
  );
}

export async function deleteFile(key: string) {
  return apiFetchWithLegacyFallback<DeleteFileResponse>(
    `${API_CLIENT_ROUTES.fileByKeyDelete.path}?${fileKeyQuery(key)}`,
    () => legacyFileKeyRoute(API_CLIENT_ROUTES.legacyFileDelete.path, key),
    {
      // Derived from the registry so the verb the contract test checks is the
      // verb actually sent — a hardcoded "DELETE" could silently disagree.
      method: API_CLIENT_ROUTES.fileByKeyDelete.method.toUpperCase(),
    }
  );
}

/**
 * Read a small object's body as text through its presigned (inline) preview
 * URL, for the Files dialog's JSON/text preview. The bytes come straight from
 * B2, so a network failure means the bucket's CORS does not allow this origin
 * (same remedy as an upload), not an API fault.
 */
export async function getStorageText(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    const here = typeof window !== "undefined" ? window.location.origin : "<your origin>";
    throw new ApiError(
      `Couldn't read the file from B2: the bucket's CORS must allow ${here} ` +
        `(services/api/scripts/setup_b2_cors.py --origin ${here} --apply).`,
      0,
    );
  }
  if (!res.ok) throw new ApiError(`B2 answered ${res.status} for the preview`, res.status);
  return res.text();
}

/**
 * Upload a raw image directly to B2 in three steps: presign (the API validates
 * the declared file and signs a short-lived PUT into
 * `labeling/raw/<project>/`), a direct browser→B2 PUT, then verify (the API
 * inspects the stored object). The bytes never pass through the API.
 *
 * Progress
 * tracks the browser→B2 leg; when it reaches 100% the queue enters its
 * server-side phase (see `upload-status`) while `verify` runs.
 */
export async function uploadFile(
  file: File,
  project: string,
  onProgress?: (percent: number) => void
): Promise<FileUploadResponse> {
  const presign = await apiFetch<PresignUploadResponse>(
    API_CLIENT_ROUTES.uploadPresign.path,
    {
      method: API_CLIENT_ROUTES.uploadPresign.method.toUpperCase(),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project,
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      }),
    }
  );

  await putFileToStorage(presign, file, onProgress);

  return apiFetch<FileUploadResponse>(API_CLIENT_ROUTES.uploadVerify.path, {
    method: API_CLIENT_ROUTES.uploadVerify.method.toUpperCase(),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: presign.key }),
  });
}

/**
 * PUT the raw file bytes to the presigned B2 URL. XHR (not fetch) because only
 * XHR exposes upload progress. The signed URL binds the exact size and
 * content-type, so `presign.headers` must be sent verbatim — B2 answers a
 * mismatch with 403.
 */
function putFileToStorage(
  presign: PresignUploadResponse,
  file: File,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        // B2 errors are XML, not JSON — surface a stable message rather than
        // the raw body (a 403 here means the signed size/type was violated).
        reject(
          new ApiError(`Upload to storage failed (${xhr.status})`, xhr.status)
        );
      }
    });

    xhr.addEventListener("error", () => reject(storageNetworkError()));
    xhr.addEventListener("abort", () =>
      reject(new ApiError("Upload aborted", 0)),
    );

    xhr.open(presign.method.toUpperCase(), presign.url);
    for (const [name, value] of Object.entries(presign.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.send(file);
  });
}

// --- labeling projects -------------------------------------------------------

const R = API_CLIENT_ROUTES;

export const getModels = () => apiFetch<ModelInfo>(R.models.path);

export const getProjects = () => apiFetch<LabelingProject[]>(R.projects.path);

/** Creates still running on the API (no project record yet). */
export const getProjectCreates = () => apiFetch<ProjectCreating[]>(R.projectCreates.path);

/** Dashboard totals and the newest releases, aggregated server-side in one call. */
export const getDashboard = () => apiFetch<DashboardSummary>(R.dashboard.path);

export const createProject = (body: ProjectCreate) =>
  apiFetch<LabelingProject>(R.projectCreate.path, jsonInit(R.projectCreate.method, body));

export const getProject = (slug: string) =>
  apiFetch<ProjectDetail>(routePath(R.project.path, { slug }));

export const getProjectProgress = (slug: string) =>
  apiFetch<ProjectProgress>(routePath(R.projectProgress.path, { slug }));

export const updateProject = (slug: string, body: ProjectUpdate) =>
  apiFetch<LabelingProject>(
    routePath(R.projectUpdate.path, { slug }),
    jsonInit(R.projectUpdate.method, body),
  );

export const deleteProject = (slug: string, purgeB2: boolean) =>
  apiFetch<ProjectDeleted>(
    routePath(R.projectDelete.path, { slug }, { purge_b2: String(purgeB2) }),
    jsonInit(R.projectDelete.method),
  );

export const syncProject = (slug: string) =>
  apiFetch<SyncResult>(routePath(R.projectSync.path, { slug }), jsonInit(R.projectSync.method));

export const getPrelabelRuns = (slug: string) =>
  apiFetch<PrelabelRun[]>(routePath(R.prelabelRuns.path, { slug }));

export const createPrelabelRun = (slug: string, body: PrelabelRunCreate) =>
  apiFetch<PrelabelRun>(
    routePath(R.prelabelRunCreate.path, { slug }),
    jsonInit(R.prelabelRunCreate.method, body),
  );

export const syncAnnotations = (slug: string) =>
  apiFetch<AnnotationSyncResult>(
    routePath(R.annotationsSync.path, { slug }),
    jsonInit(R.annotationsSync.method),
  );

export const getVerification = (slug: string) =>
  apiFetch<VerificationReport>(routePath(R.verification.path, { slug }));

export const getReleases = (slug: string) =>
  apiFetch<DatasetRelease[]>(routePath(R.releases.path, { slug }));

export const createRelease = (slug: string, body: ReleaseCreate) =>
  apiFetch<DatasetRelease>(
    routePath(R.releaseCreate.path, { slug }),
    jsonInit(R.releaseCreate.method, body),
  );

export const getRelease = (slug: string, release: string) =>
  apiFetch<DatasetRelease>(routePath(R.release.path, { slug, release }));

export const verifyRelease = (slug: string, release: string) =>
  apiFetch<VerificationReport>(
    routePath(R.releaseVerify.path, { slug, release }),
    jsonInit(R.releaseVerify.method),
  );

export type AssetKind = "raw" | "prelabels" | "annotations" | "exports";

export const getAssets = (
  slug: string,
  kind: AssetKind,
  options: { run?: string; release?: string; cursor?: string } = {},
) =>
  apiFetch<AssetPage>(
    routePath(R.assets.path, { slug }, { kind, ...options }),
  );
