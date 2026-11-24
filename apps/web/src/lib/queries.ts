"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  ApiError,
  createPrelabelRun,
  createProject,
  createRelease,
  deleteFile,
  deleteProject,
  getAssets,
  getDashboard,
  getDownloadUrl,
  getFileDetail,
  getFiles,
  getFileStats,
  getHealth,
  getModels,
  getPreviewUrl,
  getPrelabelRuns,
  getProject,
  getProjectCreates,
  getProjectProgress,
  getProjects,
  getReleases,
  getStorageText,
  getVerification,
  syncAnnotations,
  syncProject,
  updateProject,
  verifyRelease,
  type AssetKind,
} from "@/lib/api-client";
import type {
  FileMetadata,
  FileMetadataDetail,
  FileUrlResponse,
  PrelabelRun,
  PrelabelRunCreate,
  ProjectDetail,
  ProjectCreate,
  ProjectUpdate,
  ReleaseCreate,
} from "@label-studio-prelabeling-dataset-versioning/shared";
import { qk } from "@/lib/generated/query-keys";

// Query keys are GENERATED from the API contract (`pnpm gen:api`) and their
// hierarchy is declared in `scripts/gen/api-gen.config.json`, so invalidating
// a parent key still reaches its children and no hook can invent a key the API
// cannot answer. Re-exported here because this module is the data layer's
// public surface: components and tests import `qk` from `@/lib/queries`.
//
// The caching policy below — staleTime, refetchInterval, retry, `enabled`
// gating, the query-vs-mutation choice, and the cache surgery in
// `dropDeletedFileFromCache` — is hand-written on purpose and is never
// generated.
export { qk };

export type Health = Awaited<ReturnType<typeof getHealth>>;

/**
 * Gate a query on something being open/visible. Deliberately the only option we
 * expose, so callers can't drift the caching policy per call site — the ⌘K
 * palette reuses `useFiles`' key (and therefore its cache) instead of fetching
 * its own private, smaller list.
 */
export interface QueryGate {
  enabled?: boolean;
}

export function useFiles(prefix = "", limit = 100, { enabled = true }: QueryGate = {}) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.files(prefix, limit),
    queryFn: () => getFiles(prefix, limit),
    enabled,
  });
}

export function useFileStats({ enabled = true }: QueryGate = {}) {
  return useQuery({
    queryKey: qk.stats(),
    queryFn: getFileStats,
    enabled,
  });
}

// Presigned preview URL — only fetched when `enabled` is true (e.g., when
// the dialog opens for a specific file). Kept short-lived (60s) because
// the URL itself has a presigned expiry and is cheap to regenerate.
export function usePreviewUrl(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.preview(key ?? ""),
    queryFn: () => getPreviewUrl(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Body of a small JSON/text object, read through its presigned preview URL
// (so `url` must come from usePreviewUrl). Keyed under the file's preview key,
// so dropping a deleted file's preview drops this too. The caller caps the
// size before enabling it (see lib/text-preview.ts).
export function usePreviewText(key: string | undefined, url: string | null, enabled: boolean) {
  return useQuery<string, ApiError>({
    queryKey: [...qk.preview(key ?? ""), "text"],
    queryFn: () => getStorageText(url as string),
    enabled: enabled && !!key && !!url,
    staleTime: 60_000,
    retry: false,
  });
}

// Rich metadata for an already-stored file. The server recomputes it on demand
// (a full object download), so it's only fetched when `enabled` — i.e. the
// preview dialog is open AND the user expands "Detailed metadata". Kept
// short-lived like the preview URL; cheap correctness under key overwrites.
export function useFileDetail(key: string | undefined, enabled: boolean) {
  return useQuery<FileMetadataDetail, ApiError>({
    queryKey: qk.detail(key ?? ""),
    queryFn: () => getFileDetail(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Health poll for the top-of-app B2 banner. `retry: false` and letting a
// failed fetch leave `data` undefined keeps a down API silent (the
// per-component ErrorState covers that); the banner only reacts to an up API
// reporting b2_connected: false. Polls every 60s and on window focus.
export function useHealth() {
  return useQuery<Health>({
    queryKey: qk.health(),
    queryFn: getHealth,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Drop a deleted object from every cached file list, plus its own cached
 * preview/detail entries.
 *
 * Invalidation alone is not enough: the refetch re-lists the whole bucket and
 * took 5-6s in practice, so the success toast fired while the row was still
 * listed — and using that stale row's Preview 404'd. Editing the cache makes
 * the row disappear with the toast; the invalidation that follows still
 * reconciles against the server.
 *
 * Exported for tests — the mutation below is its only production caller.
 */
export function dropDeletedFileFromCache(qc: QueryClient, fileKey: string) {
  qc.setQueriesData<FileMetadata[]>(
    // Partial key: matches qk.files(prefix, limit) for every prefix/limit.
    { queryKey: [...qk.all, "files"] },
    (previous) =>
      previous ? previous.filter((file) => file.key !== fileKey) : previous,
  );
  // A presigned URL for a deleted key can only 404 now.
  qc.removeQueries({ queryKey: qk.preview(fileKey) });
  qc.removeQueries({ queryKey: qk.detail(fileKey) });
}

/**
 * Fetch a download URL for one file.
 *
 * A mutation, not a query: it has a server side effect (it bumps the download
 * counter) and it must never be cached or replayed. Being a mutation is also
 * what gives the UI an honest pending state — the old code awaited the presign
 * inside a plain click handler, so a slow round trip left the screen completely
 * unchanged and a user could not tell a working download from a dead button.
 *
 * The caller performs the navigation (see `lib/browser-download.ts`) and gets
 * `isPending` / `variables` for the pending row.
 */
export function useDownloadUrl() {
  const qc = useQueryClient();
  return useMutation<FileUrlResponse, ApiError, FileMetadata>({
    mutationFn: (file) => getDownloadUrl(file.key),
    // The server counted a download, so the dashboard's "Total Downloads" is
    // now stale. Cheap: /files/stats reads a cached bucket listing.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.stats() }),
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileKey: string) => deleteFile(fileKey),
    onSuccess: (_data, fileKey) => {
      // Remove the row immediately, then reconcile everything (lists, stats,
      // activity) against the server in the background.
      dropDeletedFileFromCache(qc, fileKey);
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

// --- labeling projects -------------------------------------------------------
//
// The generator builds key parts from QUERY parameters only, so the `{slug}`
// path parameter is appended here. Every project key starts with
// `qk.projects()`, so invalidating that one key refreshes every project view.

export const projectKeys = {
  detail: (slug: string) => [...qk.projectDetail(), slug] as const,
  progress: (slug: string) => [...qk.projectProgress(), slug] as const,
  runs: (slug: string) => [...qk.prelabelRuns(), slug] as const,
  releases: (slug: string) => [...qk.releases(), slug] as const,
  verification: (slug: string) => [...qk.verification(), slug] as const,
  assets: (slug: string, kind: AssetKind, run?: string, release?: string, cursor?: string) =>
    [...qk.assets(kind, run, release, cursor), slug] as const,
};

/** Model info rarely changes: the ML backend serves one pinned revision. */
export function useModels() {
  return useQuery({ queryKey: qk.models(), queryFn: getModels, staleTime: 5 * 60_000, retry: false });
}

export function useProjects() {
  return useQuery({ queryKey: qk.projects(), queryFn: getProjects });
}

export function useProject(slug: string) {
  return useQuery({ queryKey: projectKeys.detail(slug), queryFn: () => getProject(slug), enabled: !!slug });
}

/** How often a running seed / pre-label job is polled (stays well inside the read rate limit). */
export const PROGRESS_POLL_MS = 1500;

/**
 * Seeding / pre-label progress for one project. Polls while `poll` is set (the
 * caller has a create or run in flight) and keeps polling on its own while the
 * server reports a job, so a run started before a reload is still followed.
 */
export function useProjectProgress(slug: string, { poll = false, enabled = true }: QueryGate & { poll?: boolean } = {}) {
  return useQuery({
    queryKey: projectKeys.progress(slug),
    queryFn: () => getProjectProgress(slug),
    enabled: enabled && !!slug,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) =>
      poll || query.state.data?.prelabel || query.state.data?.seeding || query.state.data?.release
        ? PROGRESS_POLL_MS
        : false,
  });
}

/**
 * Dashboard totals and recent releases in ONE request. Fetching every project's
 * detail and releases from the browser (1 + 2N calls) queued behind the
 * six-connections-per-host limit and left the cards as skeletons for 10-14s.
 * Under `qk.projects()`, so any project action refreshes it.
 */
export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard(), queryFn: getDashboard });
}

/**
 * Creates still running on the API, so /projects can show them after a reload
 * (the create dialog's own progress dies with the page). Polls while any is
 * running; under `qk.projects()`, so a finished create refreshes it.
 */
export function useProjectCreates() {
  return useQuery({
    queryKey: qk.projectCreates(),
    queryFn: getProjectCreates,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => ((query.state.data ?? []).length > 0 ? PROGRESS_POLL_MS : false),
  });
}

export function usePrelabelRuns(slug: string) {
  return useQuery({ queryKey: projectKeys.runs(slug), queryFn: () => getPrelabelRuns(slug), enabled: !!slug });
}

export function useReleases(slug: string) {
  return useQuery({ queryKey: projectKeys.releases(slug), queryFn: () => getReleases(slug), enabled: !!slug });
}

/** Live verification reads B2 and Label Studio, so it is fetched on demand. */
export function useVerification(slug: string, { enabled = true }: QueryGate = {}) {
  return useQuery({
    queryKey: projectKeys.verification(slug),
    queryFn: () => getVerification(slug),
    enabled: enabled && !!slug,
    staleTime: 0,
  });
}

export function useAssets(
  slug: string,
  kind: AssetKind,
  options: { run?: string; release?: string; cursor?: string } = {},
) {
  return useQuery({
    queryKey: projectKeys.assets(slug, kind, options.run, options.release, options.cursor),
    queryFn: () => getAssets(slug, kind, options),
    enabled: !!slug,
  });
}

/** After any project action: every project view, plus the bucket views. */
export function useInvalidateProjects() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.projects() });
    qc.invalidateQueries({ queryKey: qk.stats() });
    qc.invalidateQueries({ queryKey: [...qk.all, "files"] });
  };
}

export function useCreateProject() {
  const invalidate = useInvalidateProjects();
  return useMutation<Awaited<ReturnType<typeof createProject>>, ApiError, ProjectCreate>({
    mutationFn: createProject,
    onSuccess: invalidate,
  });
}

export function useUpdateProject(slug: string) {
  const invalidate = useInvalidateProjects();
  return useMutation<Awaited<ReturnType<typeof updateProject>>, ApiError, ProjectUpdate>({
    mutationFn: (body) => updateProject(slug, body),
    onSuccess: invalidate,
  });
}

export function useDeleteProject(slug: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateProjects();
  return useMutation<Awaited<ReturnType<typeof deleteProject>>, ApiError, { purgeB2: boolean }>({
    mutationFn: ({ purgeB2 }) => deleteProject(slug, purgeB2),
    onSuccess: () => {
      qc.removeQueries({ queryKey: projectKeys.detail(slug) });
      invalidate();
    },
  });
}

export function useSyncProject(slug: string) {
  const invalidate = useInvalidateProjects();
  return useMutation<Awaited<ReturnType<typeof syncProject>>, ApiError, void>({
    mutationFn: () => syncProject(slug),
    onSuccess: invalidate,
  });
}

/**
 * Put a finished run into the cached detail and run list at once. Invalidation
 * alone left the Overview on "Pre-label runs 0" for the ~4s the detail refetch
 * takes (it lists every Label Studio task and B2 prefix), while the toast
 * already announced the run. Exported for tests.
 */
export function addRunToCache(qc: QueryClient, slug: string, run: PrelabelRun) {
  qc.setQueryData<ProjectDetail>(projectKeys.detail(slug), (previous) =>
    previous
      ? { ...previous, latest_run: run, counts: { ...previous.counts, prelabel_runs: previous.counts.prelabel_runs + 1 } }
      : previous,
  );
  qc.setQueryData<PrelabelRun[]>(projectKeys.runs(slug), (previous) => (previous ? [run, ...previous] : previous));
}

export function useCreatePrelabelRun(slug: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateProjects();
  return useMutation<PrelabelRun, ApiError, PrelabelRunCreate>({
    mutationFn: (body) => createPrelabelRun(slug, body),
    onSuccess: (run) => {
      addRunToCache(qc, slug, run);
      invalidate();
    },
  });
}

export function useSyncAnnotations(slug: string) {
  const invalidate = useInvalidateProjects();
  return useMutation<Awaited<ReturnType<typeof syncAnnotations>>, ApiError, void>({
    mutationFn: () => syncAnnotations(slug),
    onSuccess: invalidate,
  });
}

export function useCreateRelease(slug: string) {
  const invalidate = useInvalidateProjects();
  return useMutation<Awaited<ReturnType<typeof createRelease>>, ApiError, ReleaseCreate>({
    mutationFn: (body) => createRelease(slug, body),
    onSuccess: invalidate,
  });
}

/** Re-verification is a POST (it re-reads every file) but has no side effects. */
export function useVerifyRelease(slug: string) {
  return useMutation<Awaited<ReturnType<typeof verifyRelease>>, ApiError, string>({
    mutationFn: (release) => verifyRelease(slug, release),
  });
}
