"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, RefreshCw, ScanSearch, Sparkles, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import type { DatasetRelease, LabelingProject, ProjectCounts } from "@label-studio-prelabeling-dataset-versioning/shared";

import { Button } from "@/components/ui/button";
import { useElapsedMs } from "@/hooks/use-elapsed";
import { annotationSyncProgressMessage, jobProgressView, syncProgressMessage } from "@/lib/job-progress";
import { previewHref } from "@/lib/preview-deep-link";
import { nextLoopStep, type LoopStep } from "@/lib/project-next-step";
import {
  useCreatePrelabelRun,
  useInvalidateProjects,
  useProjectProgress,
  useSyncAnnotations,
  useSyncProject,
} from "@/lib/queries";
import { JobProgressLine } from "./job-progress-line";
import { ReleaseDialog } from "./release-dialog";

interface ProjectActionsProps {
  project: LabelingProject;
  counts: ProjectCounts;
  /** The newest release and pre-label run: together they say whether the loop is done. */
  latestRelease: DatasetRelease | null;
  latestRunId: string | null;
  onVerify: () => void;
  /** True while the live verification report is being fetched. */
  verifying: boolean;
  /** A failed pre-label run's message, or null once a run succeeds or starts. */
  onPrelabelFailure: (message: string | null) => void;
}

/** The "run" verb: every step of the annotation loop, in loop order. The next step is the primary button. */
export function ProjectActions({
  project,
  counts,
  latestRelease,
  latestRunId,
  onVerify,
  verifying,
  onPrelabelFailure,
}: ProjectActionsProps) {
  const slug = project.slug;
  const sync = useSyncProject(slug);
  const prelabel = useCreatePrelabelRun(slug);
  const annotations = useSyncAnnotations(slug);
  const invalidate = useInvalidateProjects();
  // The server's own record of a run in flight: it outlives this page, so a
  // run started before a reload still shows here and still blocks a second one.
  const progress = useProjectProgress(slug, { poll: prelabel.isPending });
  const serverRun = progress.data?.prelabel ?? null;
  const prelabelRunning = prelabel.isPending || serverRun !== null;
  const busy = sync.isPending || prelabelRunning || annotations.isPending || verifying;
  const next = nextLoopStep(counts, latestRelease, latestRunId);
  // Both syncs are one request with no server-side progress: name the stage and count seconds.
  const syncElapsed = useElapsedMs(sync.submittedAt, sync.isPending);
  const annotationsElapsed = useElapsedMs(annotations.submittedAt, annotations.isPending);
  const variant = (step: LoopStep) => (next.step === step ? "default" : "outline");

  // A run this page did not start (it was found running on load) has no
  // mutation to report its end, so announce it and refresh when it vanishes.
  const followingOrphan = useRef(false);
  useEffect(() => {
    if (serverRun && prelabel.status === "idle") {
      followingOrphan.current = true;
    } else if (!serverRun && followingOrphan.current) {
      followingOrphan.current = false;
      invalidate();
      toast.success("The pre-label run that was in progress has finished", {
        description: "Overview and Pre-label runs are refreshed with its result.",
      });
    }
  }, [serverRun, prelabel.status, invalidate]);

  const fail = (what: string) => (error: Error) => toast.error(`${what} failed`, { description: error.message });

  const runPrelabels = () => {
    onPrelabelFailure(null);
    prelabel.mutate(
      {},
      {
        onSuccess: (run) =>
          toast.success(`Pre-label run ${run.run_id}`, {
            description: `${run.boxes} boxes on ${run.tasks} tasks in ${run.duration_seconds}s (${run.device}).`,
          }),
        // Persisted on the page (not only a toast) so the failure and its fix stay visible.
        onError: (error) => onPrelabelFailure(error.message),
      },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" aria-busy={busy}>
        <Button
          variant={variant("sync")}
          size="sm"
          className="h-8"
          disabled={busy}
          aria-busy={sync.isPending}
          onClick={() =>
            sync.mutate(undefined, {
              onSuccess: (r) => {
                const added = r.tasks_after - r.tasks_before;
                (r.in_sync ? toast.success : toast.warning)(`Synced: ${r.tasks_after} tasks for ${r.raw_objects} images`, {
                  description: `${r.in_sync ? `${added} new tasks.` : "Task count differs from raw images."}${
                    added > 0 ? " Starting pre-labels for them now." : ""
                  }`,
                });
                // New tasks have no suggestions yet: chain straight into the next step.
                if (added > 0) runPrelabels();
              },
              onError: fail("Sync from B2"),
            })
          }
        >
          {sync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {sync.isPending ? "Syncing…" : "Sync from B2"}
        </Button>
        <Button
          variant={variant("prelabel")}
          size="sm"
          className="h-8"
          disabled={busy}
          onClick={runPrelabels}
        >
          {prelabelRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {prelabelRunning ? "Pre-labeling…" : "Run pre-labels"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={busy}
          aria-busy={annotations.isPending}
          onClick={() =>
            annotations.mutate(undefined, {
              onSuccess: (r) =>
                toast.success(`${r.annotation_objects} annotation objects on B2`, {
                  description: `${r.annotated_tasks} tasks are annotated in Label Studio.`,
                }),
              onError: fail("Sync annotations"),
            })
          }
        >
          {annotations.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
          {annotations.isPending ? "Syncing annotations…" : "Sync annotations"}
        </Button>
        <Button variant="outline" size="sm" className="h-8" disabled={busy} aria-busy={verifying} onClick={onVerify}>
          {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
          {verifying ? "Verifying…" : "Verify"}
        </Button>
        <ReleaseDialog slug={slug} counts={counts} primary={next.step === "release"} />
        <Button asChild variant={next.step === "annotate" ? "default" : "ghost"} size="sm" className="h-8">
          <a href={project.label_studio_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Label Studio
          </a>
        </Button>
      </div>
      {sync.isPending && (
        <JobProgressLine
          label="Sync from B2 progress"
          view={{ message: syncProgressMessage(project.source_prefix, syncElapsed), percent: null }}
        />
      )}
      {annotations.isPending && (
        <JobProgressLine
          label="Sync annotations progress"
          view={{ message: annotationSyncProgressMessage(project.target_prefix, annotationsElapsed), percent: null }}
        />
      )}
      {prelabelRunning && (
        <JobProgressLine
          label="Pre-label run progress"
          view={serverRun ? jobProgressView(serverRun) : { message: "Starting the pre-label run…", percent: null }}
        />
      )}
      {/* The values live only in .env; never render them. */}
      <p className="text-xs text-muted-foreground">
        Label Studio asks you to sign in: use <code className="font-mono">LABEL_STUDIO_USERNAME</code> and{" "}
        <code className="font-mono">LABEL_STUDIO_PASSWORD</code> from <code className="font-mono">.env</code>.
      </p>
      <p role="status" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {next.step === "done" ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden="true" />
        ) : (
          <ArrowRight className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        )}
        <span className="font-medium text-foreground">
          {next.step === "done" ? "Done" : "Next"}: {next.title}
          {next.manifestKey ? (
            <>
              {" — "}
              <Link className="underline underline-offset-4" href={previewHref(next.manifestKey)}>
                view its manifest
              </Link>
            </>
          ) : null}
          .
        </span>
        <span>{next.hint}</span>
        {next.step === "upload" && (
          <Link className="underline underline-offset-4" href={`/upload?project=${encodeURIComponent(slug)}`}>
            Go to Upload
          </Link>
        )}
      </p>
    </div>
  );
}
