import type { ProjectCreating } from "@label-studio-prelabeling-dataset-versioning/shared";

import { jobProgressView, type JobProgressView } from "@/lib/job-progress";

/**
 * Copy for the "Create project" wait (45-100s with seed images).
 *
 * The API does the work in one request — seed the images, then create the
 * Label Studio project, its two B2 storages and the ML backend link — so the
 * stages are named honestly as an ordered list rather than a fake percentage.
 * Pure on purpose (the dialog owns the clock) so the wording is unit-testable.
 */

/** Past this, say why it is slow and that the dialog can be closed. */
export const SLOW_CREATE_MS = 10_000;

export interface CreateProgressCopy {
  /** Shown next to the spinner. */
  message: string;
  /** Shown once the wait is long. */
  hint: string | null;
}

export function createProgressCopy(elapsedMs: number, seeding: boolean): CreateProgressCopy {
  const seconds = Math.floor(elapsedMs / 1000);
  const steps = seeding
    ? "Copying the 8 sample images to B2, then connecting Label Studio's storages and the ML backend"
    : "Connecting Label Studio's storages and the ML backend";
  return {
    message: `${steps}… ${seconds}s`,
    hint:
      elapsedMs >= SLOW_CREATE_MS
        ? `${
            seeding ? "The first seed downloads each image once, so this can take a minute or two. " : ""
          }You can close this dialog: creation keeps running and you'll get a notice when the project is ready.`
        : null,
  };
}

/**
 * One in-flight create as /projects shows it after a reload, e.g.
 * "Creating Street scenes: Copying sample images to B2… 3 of 8".
 */
export function creatingRowView(create: ProjectCreating): JobProgressView {
  const view = jobProgressView(create.progress);
  return { message: `Creating ${create.title}: ${view.message}`, percent: view.percent };
}
