import type { DatasetRelease, ProjectCounts } from "@label-studio-prelabeling-dataset-versioning/shared";

/** The annotation loop's steps, in loop order; "done" once the latest release is current. */
export type LoopStep = "upload" | "sync" | "prelabel" | "annotate" | "release" | "done";

export interface NextStep {
  step: LoopStep;
  /** One line, shown as "Next: <title>" ("Done: <title>" for the done step). */
  title: string;
  hint: string;
  /** The done step only: the release's manifest.json key, to link to. */
  manifestKey?: string;
}

/**
 * True when `release` already covers the project as it is: every task is
 * annotated, the release holds exactly that many images, and it was cut from
 * the latest pre-label run. A new image, task or run makes it false. Edits to
 * an already-annotated task do not change any count, so they are not seen
 * here; Verify and Cut release still re-check B2 in full.
 */
export function releaseIsCurrent(
  counts: ProjectCounts,
  release: DatasetRelease | null,
  latestRunId: string | null,
): boolean {
  return (
    release !== null &&
    counts.tasks > 0 &&
    counts.tasks === counts.raw_objects &&
    counts.annotated_tasks === counts.tasks &&
    release.images === counts.tasks &&
    (latestRunId === null || release.prelabel_run_id === latestRunId)
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The next step of the loop, derived from the project's counts alone, so the
 * project page can mark it (primary button + a persistent "Next:" cue) and
 * survive a reload. Annotation objects on B2 are not in `counts`; the release
 * itself re-verifies them, so the last step says to sync annotations first.
 * Once the latest release covers the current set (`releaseIsCurrent`), the
 * loop is "done" and no action is the forced primary.
 */
export function nextLoopStep(
  counts: ProjectCounts,
  latestRelease: DatasetRelease | null = null,
  latestRunId: string | null = null,
): NextStep {
  if (counts.raw_objects === 0) {
    return {
      step: "upload",
      title: "Upload raw images",
      hint: "Upload images into this project from the Upload page, then Sync from B2.",
    };
  }
  if (counts.tasks < counts.raw_objects) {
    return {
      step: "sync",
      title: "Sync from B2",
      hint: `${plural(counts.raw_objects - counts.tasks, "raw image")} on B2 ${
        counts.raw_objects - counts.tasks === 1 ? "has" : "have"
      } no Label Studio task yet.`,
    };
  }
  if (counts.prelabel_runs === 0) {
    return {
      step: "prelabel",
      title: "Run pre-labels",
      hint: `Score all ${plural(counts.tasks, "task")} with the detector so annotators start from suggestions.`,
    };
  }
  if (counts.annotated_tasks < counts.tasks) {
    return {
      step: "annotate",
      title: "Annotate in Label Studio",
      hint: `${plural(counts.tasks - counts.annotated_tasks, "task")} still need an annotation. Correct the suggestions, then Sync annotations.`,
    };
  }
  if (latestRelease && releaseIsCurrent(counts, latestRelease, latestRunId)) {
    return {
      step: "done",
      title: `release ${latestRelease.release} is on B2`,
      hint: `It covers all ${plural(counts.tasks, "annotated task")}. New images or a new pre-label run start the next release.`,
      manifestKey: `${latestRelease.prefix}manifest.json`,
    };
  }
  return {
    step: "release",
    title: "Cut a release",
    hint: "Every task is annotated. Sync annotations to B2, Verify, then Cut release.",
  };
}

/** Why a release would be refused right now, from the counts alone ([] = looks ready). */
export function releaseBlockers(counts: ProjectCounts): string[] {
  const blockers: string[] = [];
  if (counts.tasks === 0) blockers.push("The project has no tasks yet — Sync from B2 first.");
  if (counts.prelabel_runs === 0) blockers.push("No pre-label run yet — Run pre-labels first.");
  if (counts.tasks > 0 && counts.annotated_tasks < counts.tasks) {
    blockers.push(
      `${plural(counts.tasks - counts.annotated_tasks, "task")} of ${counts.tasks} ${
        counts.tasks - counts.annotated_tasks === 1 ? "is" : "are"
      } not annotated in Label Studio.`,
    );
  }
  return blockers;
}

/**
 * A failed pre-label run, in words a person can act on. The raw upstream text
 * stays available as `detail`.
 */
export function prelabelFailureHint(message: string): string {
  if (/ML backend/i.test(message) && /(failed|unreachable|connect)/i.test(message) && !/returned/.test(message)) {
    return "The ML backend is not reachable. Start it with `docker compose up -d`, then Run pre-labels again.";
  }
  if (/no tasks/i.test(message)) return "Sync from B2 first, then Run pre-labels again.";
  if (/ML backend/i.test(message)) {
    return "The ML backend rejected the request. Check `docker compose logs ml-backend`, then Run pre-labels again.";
  }
  if (/Label Studio/i.test(message)) {
    return "Label Studio did not answer as expected. Check `docker compose logs label-studio`, then Run pre-labels again.";
  }
  return "No run record was written. Fix the cause below, then Run pre-labels again.";
}
