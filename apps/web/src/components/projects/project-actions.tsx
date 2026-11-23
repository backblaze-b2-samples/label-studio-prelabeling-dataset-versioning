"use client";

import { ExternalLink, Loader2, RefreshCw, ScanSearch, Sparkles, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import type { LabelingProject } from "@label-studio-prelabeling-dataset-versioning/shared";

import { Button } from "@/components/ui/button";
import { useCreatePrelabelRun, useSyncAnnotations, useSyncProject } from "@/lib/queries";
import { ReleaseDialog } from "./release-dialog";

interface ProjectActionsProps {
  project: LabelingProject;
  releaseCount: number;
  onVerify: () => void;
}

/** The "run" verb: every step of the annotation loop, in loop order. */
export function ProjectActions({ project, releaseCount, onVerify }: ProjectActionsProps) {
  const slug = project.slug;
  const sync = useSyncProject(slug);
  const prelabel = useCreatePrelabelRun(slug);
  const annotations = useSyncAnnotations(slug);
  const busy = sync.isPending || prelabel.isPending || annotations.isPending;

  const fail = (what: string) => (error: Error) => toast.error(`${what} failed`, { description: error.message });

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={busy}>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        disabled={busy}
        onClick={() =>
          sync.mutate(undefined, {
            onSuccess: (r) =>
              (r.in_sync ? toast.success : toast.warning)(`Synced: ${r.tasks_after} tasks for ${r.raw_objects} images`, {
                description: r.in_sync ? `${r.tasks_after - r.tasks_before} new tasks.` : "Task count differs from raw images.",
              }),
            onError: fail("Sync from B2"),
          })
        }
      >
        {sync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Sync from B2
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        disabled={busy}
        onClick={() =>
          prelabel.mutate(
            {},
            {
              onSuccess: (run) =>
                toast.success(`Pre-label run ${run.run_id}`, {
                  description: `${run.boxes} boxes on ${run.tasks} tasks in ${run.duration_seconds}s (${run.device}).`,
                }),
              onError: fail("Pre-label run"),
            },
          )
        }
      >
        {prelabel.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {prelabel.isPending ? "Pre-labeling…" : "Run pre-labels"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        disabled={busy}
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
        Sync annotations
      </Button>
      <Button variant="outline" size="sm" className="h-8" disabled={busy} onClick={onVerify}>
        <ScanSearch className="h-3.5 w-3.5" />
        Verify
      </Button>
      <ReleaseDialog slug={slug} releaseCount={releaseCount} />
      <Button asChild variant="ghost" size="sm" className="h-8">
        <a href={project.label_studio_url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3.5 w-3.5" />
          Open in Label Studio
        </a>
      </Button>
    </div>
  );
}
