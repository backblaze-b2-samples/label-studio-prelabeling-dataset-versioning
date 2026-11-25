import type { JobProgress } from "@label-studio-prelabeling-dataset-versioning/shared";

/**
 * Copy and percentage for a server-reported job (`GET /projects/{slug}/progress`).
 *
 * Pure on purpose so the wording is unit-testable. `total` is 0 while the job
 * is still finding out how much work there is (e.g. listing Label Studio
 * tasks), and then the bar stays indeterminate rather than showing a fake 0%.
 */
export interface JobProgressView {
  message: string;
  /** 0-100, or null while the total is unknown. */
  percent: number | null;
}

export function jobProgressView(job: JobProgress): JobProgressView {
  if (job.total <= 0) return { message: `${job.stage}…`, percent: null };
  const done = Math.min(Math.max(job.done, 0), job.total);
  return { message: `${job.stage}… ${done} of ${job.total}`, percent: Math.round((done / job.total) * 100) };
}

const seconds = (elapsedMs: number) => Math.floor(Math.max(0, elapsedMs) / 1000);

/**
 * Stage line + bar for "Cut release" (one request, ~10-20s on a slow bucket).
 * The API reports each named step as `done`/`total` steps; until the first
 * poll answers, the line says it is starting, with no fake percentage.
 */
export function releaseProgressView(job: JobProgress | null, elapsedMs: number): JobProgressView {
  if (!job || job.total <= 0) return { message: `Starting the release… ${seconds(elapsedMs)}s`, percent: null };
  const done = Math.min(Math.max(job.done, 0), job.total);
  return {
    message: `Step ${Math.min(done + 1, job.total)} of ${job.total}: ${job.stage}… ${seconds(elapsedMs)}s`,
    percent: Math.round((done / job.total) * 100),
  };
}

/**
 * Stage line for "Sync from B2" (one request, ~5-10s). Label Studio does the
 * scan itself and reports no progress, so the line names what it is doing and
 * where, with the elapsed time.
 */
export function syncProgressMessage(sourcePrefix: string, elapsedMs: number): string {
  return `Label Studio is scanning ${sourcePrefix} on B2 and adding a task for each new image… ${seconds(elapsedMs)}s`;
}

/** Stage line for "Sync annotations" (one request, ~5-10s); same reasoning as `syncProgressMessage`. */
export function annotationSyncProgressMessage(targetPrefix: string, elapsedMs: number): string {
  return `Label Studio is writing annotations to ${targetPrefix} on B2, then they are counted… ${seconds(elapsedMs)}s`;
}
