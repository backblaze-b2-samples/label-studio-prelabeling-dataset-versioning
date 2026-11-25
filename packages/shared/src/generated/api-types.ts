// GENERATED FILE — DO NOT EDIT.
//
// Written by `pnpm gen:api` from:
//   docs/api/openapi.json
//
// Hand edits are discarded by the next `pnpm gen:api`. `pnpm gen:check`
// (part of `pnpm verify:web`) fails while this file disagrees with the
// contract. To change what is here, change the FastAPI route or Pydantic
// model and re-run `pnpm contract:export && pnpm gen:api`.

export interface AnnotationSyncResult {
  /** Tasks Label Studio reports as annotated. */
  annotated_tasks: number;
  /** Annotation objects under the target prefix after the sync. */
  annotation_objects: number;
}

export interface AssetItem {
  /** Raw images only: its task has at least one annotation. */
  annotation_status: boolean | null;
  /** Run id for pre-labels, release name for exports. */
  group: string | null;
  key: string;
  last_modified: string;
  /** Raw images only: has a pre-label in the latest run. */
  prelabel_status: boolean | null;
  size_bytes: number;
}

export interface AssetPage {
  /** Run ids or release names present on this page. */
  groups: string[];
  items: AssetItem[];
  kind: string;
  next_cursor: string | null;
  prefix: string;
  project: string;
}

/** Totals across every project plus the newest releases, in one call. */
export interface DashboardSummary {
  annotated_tasks: number;
  projects: number;
  /** Newest first, at most 10. */
  recent_releases: DatasetRelease[];
  releases: number;
  tasks: number;
  /** Slugs whose counts could not be read (e.g. Label Studio down). */
  unreadable: string[];
}

/** A committed release under `labeling/exports/<project>/<release>/`. */
export interface DatasetRelease {
  annotations: number;
  created_at: string;
  images: number;
  /** Included on create and on the single-release route. */
  manifest: ReleaseManifest | null;
  notes: string | null;
  prefix: string;
  prelabel_run_id: string | null;
  project: string;
  release: string;
}

/** Acknowledgement that one object was removed from the bucket. */
export interface DeleteFileResponse {
  deleted: boolean;
  key: string;
}

/** One stored object as the file list and the by-key metadata route see it. */
export interface FileMetadata {
  content_type: string;
  filename: string;
  folder: string;
  key: string;
  size_bytes: number;
  size_human: string;
  uploaded_at: string;
  /**
   * Public object URL, set only when B2_PUBLIC_URL_BASE is configured and
   * the bucket is public. Null otherwise — the UI asks for a presigned URL
   * instead.
   */
  url: string | null;
}

/** Rich metadata recomputed on demand by re-reading the stored object. */
export interface FileMetadataDetail {
  /** Audio/video: bits per second. */
  bitrate: number | null;
  /** Audio/video: codec name. */
  codec: string | null;
  /** Audio/video: duration in seconds. */
  duration_seconds: number | null;
  /**
   * Image-specific: EXIF tags, values stringified. Null for non-images or
   * when no EXIF block was present.
   */
  exif: Record<string, string> | null;
  extension: string;
  filename: string;
  /** Image-specific: pixel height. Null for non-images. */
  image_height: number | null;
  /** Image-specific: pixel width. Null for non-images. */
  image_width: number | null;
  md5: string;
  /**
   * Set when a format-specific extractor was skipped or failed (e.g. an
   * image above Pillow's decompression-bomb limit). The core fields are
   * always exact, so the UI shows this instead of silently dropping the
   * Image / PDF section.
   */
  metadata_warning: string | null;
  mime_type: string;
  /** PDF-specific: author. */
  pdf_author: string | null;
  /** PDF-specific: page count. Null for non-PDFs. */
  pdf_pages: number | null;
  /** PDF-specific: title. */
  pdf_title: string | null;
  sha256: string;
  size_bytes: number;
  size_human: string;
  uploaded_at: string;
}

/** The stored object as `POST /upload/verify` reports it back. */
export interface FileUploadResponse {
  content_type: string;
  filename: string;
  key: string;
  /** Rich metadata, when extraction succeeded for this type. */
  metadata: FileMetadataDetail | null;
  size_bytes: number;
  size_human: string;
  uploaded_at: string;
  /** Public object URL when the bucket is public, else null. */
  url: string | null;
}

/** A short-lived presigned GET for downloading or previewing one object. */
export interface FileUrlResponse {
  /**
   * Presigned GET URL. Download URLs force an attachment disposition;
   * preview URLs are signed inline so a PDF renders in place.
   */
  url: string;
}

/** A task (or a raw image with no task yet) that blocks a release. */
export interface FlaggedTask {
  reasons: string[];
  /** B2 key of the raw image the task points at. */
  source_key: string | null;
  /** Label Studio task id; null for a raw image never synced. */
  task_id: number | null;
}

export interface HTTPValidationError {
  detail?: ValidationError[];
}

/**
 * Liveness plus B2, Label Studio and ML backend reachability. The route
 * answers HTTP 200 even when a dependency is unreachable, so a caller must
 * read the per-service fields rather than trusting the status code.
 */
export interface HealthStatus {
  /** True when the bucket answered a cheap head request. */
  b2_connected: boolean;
  label_studio: ServiceStatus;
  ml_backend: ServiceStatus;
  /**
   * "healthy" when B2, Label Studio and the ML backend all answered, else
   * "degraded".
   */
  status: string;
}

/** One long-running job's position, as last reported by the job itself. */
export interface JobProgress {
  /** Units finished so far (images copied, tasks scored). */
  done: number;
  /** What the job is doing now, in a few words. */
  stage: string;
  started_at: string;
  /**
   * What the job is for when the slug alone does not say (a new project's
   * title).
   */
  subject: string | null;
  /** Units the job will process; 0 while still unknown. */
  total: number;
}

/** A Label Studio project bound to one raw-image prefix on B2. */
export interface LabelingProject {
  created_at: string;
  description: string;
  label_studio_project_id: number;
  /** Deep link that opens the project in Label Studio. */
  label_studio_url: string;
  labels: string[];
  model_id: string;
  slug: string;
  /** Label Studio source storage prefix (raw images). */
  source_prefix: string;
  /** Label Studio target storage prefix (annotations). */
  target_prefix: string;
  threshold: number;
  title: string;
  updated_at: string;
}

/** One file written under the release prefix, with its integrity data. */
export interface ManifestFileRow {
  bytes: number;
  key: string;
  sha256: string;
}

/** One task as it went into the release. */
export interface ManifestTaskRow {
  /** Suggested boxes kept unchanged. */
  accepted: number;
  /** Boxes drawn that the model did not suggest. */
  added: number;
  annotation_boxes: number;
  annotation_key: string;
  /** Suggested boxes kept but moved, resized or relabelled. */
  corrected: number;
  prelabel_boxes: number;
  prelabel_key: string | null;
  /** Suggested boxes the annotator deleted. */
  removed: number;
  source_etag: string | null;
  source_key: string;
  task_id: number;
}

export interface ManifestTotals {
  accepted: number;
  added: number;
  /** COCO annotation (box) count. */
  annotations: number;
  corrected: number;
  images: number;
  removed: number;
}

/** The local detector the ML backend serves. */
export interface ModelInfo {
  device: string;
  id: string;
  labels: string[];
  license: string;
  name: string;
  revision: string;
  source_url: string;
}

/**
 * One pre-label run: every task scored once by the local model, saved to
 * B2.
 */
export interface PrelabelRun {
  /** Suggested boxes across every task. */
  boxes: number;
  /** torch device the ML backend ran on (cuda, mps or cpu). */
  device: string;
  duration_seconds: number;
  model_id: string;
  model_revision: string;
  /** B2 prefix holding one JSON per task plus `_run.json`. */
  prefix: string;
  project: string;
  /** `YYYYMMDDTHHMMSSZ-<model-short>`; also the Label Studio model_version. */
  run_id: string;
  started_at: string;
  /** Tasks scored in this run. */
  tasks: number;
  threshold: number;
}

/** Start a pre-label run. Omit `threshold` to use the project's own. */
export interface PrelabelRunCreate {
  /** Minimum detection confidence kept as a suggestion. */
  threshold?: number | null;
}

/** What the browser declares before uploading a raw image directly to B2. */
export interface PresignUploadRequest {
  content_type: string;
  filename: string;
  /** Labeling project slug; the key lands in its raw prefix. */
  project: string;
  size_bytes: number;
}

/**
 * A short-lived presigned PUT the browser uploads to, plus the exact
 * headers it must send. `Content-Length` and `content-type` are signed
 * into the URL, so B2 rejects a body of any other size or type.
 */
export interface PresignUploadResponse {
  content_type: string;
  expires_in: number;
  /**
   * Signed into the URL, so the browser must send them verbatim — B2
   * answers a mismatch with 403.
   */
  headers: Record<string, string>;
  key: string;
  method: string;
  url: string;
}

export interface ProjectCounts {
  annotated_tasks: number;
  prelabel_runs: number;
  raw_objects: number;
  releases: number;
  tasks: number;
}

export interface ProjectCreate {
  description?: string;
  labels: string[];
  /** Copy the 8 pinned CC0 sample images into the raw prefix. */
  seed_sample_images?: boolean;
  threshold?: number;
  title: string;
}

/**
 * A create still in flight (no descriptor on B2 yet), so /projects can
 * show it after a reload.
 */
export interface ProjectCreating {
  /** Seeding progress while images copy, else the create step. */
  progress: JobProgress;
  slug: string;
  title: string;
}

export interface ProjectDeleted {
  /** Objects removed from B2 (0 unless purge_b2=true). */
  b2_objects_deleted: number;
  label_studio_project_deleted: boolean;
  slug: string;
}

export interface ProjectDetail {
  counts: ProjectCounts;
  latest_release: DatasetRelease | null;
  latest_run: PrelabelRun | null;
  project: LabelingProject;
}

/**
 * Jobs running for one project right now; null when that job is idle.
 * In-process state of this API worker: it survives a browser reload but
 * not an API restart.
 */
export interface ProjectProgress {
  /** A pre-label run in flight. */
  prelabel: JobProgress | null;
  /** A release being cut; `done`/`total` count its steps. */
  release: JobProgress | null;
  /** Sample images being copied during create. */
  seeding: JobProgress | null;
}

/** Labels are deliberately absent: they are fixed after creation. */
export interface ProjectUpdate {
  description?: string | null;
  threshold?: number | null;
  title?: string | null;
}

/** 409 body: the release already exists, or verification found gaps. */
export interface ReleaseBlocked {
  detail: string;
  flagged: FlaggedTask[];
}

/** One assertion made while re-verifying a stored release. */
export interface ReleaseCheck {
  detail: string;
  name: string;
  ok: boolean;
}

/** Cut an immutable release. Omit `name` to get `v<N+1>`. */
export interface ReleaseCreate {
  /** Release name, e.g. v1. */
  name?: string | null;
  notes?: string | null;
}

/**
 * `manifest.json`: written last, so its presence is what commits a
 * release.
 */
export interface ReleaseManifest {
  created_at: string;
  files: ManifestFileRow[];
  label_studio_version: string;
  model_id: string;
  model_revision: string;
  notes: string | null;
  prelabel_run_id: string | null;
  project: string;
  release: string;
  tasks: ManifestTaskRow[];
  totals: ManifestTotals;
}

/** Reachability of one companion service (Label Studio or the ML backend). */
export interface ServiceStatus {
  /** Why the probe failed, when it failed. */
  detail: string | null;
  /** ML backend only: the torch device the model runs on. */
  device: string | null;
  /** True when the service answered its health probe. */
  ok: boolean;
  /** Base URL this API uses to reach the service. */
  url: string;
  /** Reported version (Label Studio release, or model id). */
  version: string | null;
}

export interface SyncResult {
  /** True when tasks_after equals raw_objects. */
  in_sync: boolean;
  /** Raw images under the source prefix that match the image filter. */
  raw_objects: number;
  tasks_after: number;
  tasks_before: number;
}

/** Aggregate bucket figures behind the file browser and command palette. */
export interface UploadStats {
  total_downloads: number;
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
}

export interface ValidationError {
  ctx?: Record<string, unknown>;
  input?: unknown;
  loc: (string | number)[];
  msg: string;
  type: string;
}

/** What B2 and Label Studio each hold for one project, side by side. */
export interface VerificationCounts {
  annotation_objects: number;
  /** Bounding boxes across the latest annotation of every task. */
  boxes: number;
  raw_objects: number;
  tasks: number;
  tasks_with_annotations: number;
  tasks_with_prelabels: number;
}

/**
 * Live diff of raw objects, tasks, pre-labels, annotations (and a
 * release's files).
 */
export interface VerificationReport {
  /** Release re-verification checks; empty for a live project check. */
  checks: ReleaseCheck[];
  counts: VerificationCounts;
  flagged: FlaggedTask[];
  /** The run the pre-label check used (the latest). */
  prelabel_run_id: string | null;
  project: string;
  /** Set when a stored release was re-verified. */
  release: string | null;
  status: string;
}

/** Sent after the direct PUT so the API can inspect the stored object. */
export interface VerifyUploadRequest {
  key: string;
}
