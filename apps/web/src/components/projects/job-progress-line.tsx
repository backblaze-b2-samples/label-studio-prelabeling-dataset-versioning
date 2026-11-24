"use client";

import { Loader2 } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import type { JobProgressView } from "@/lib/job-progress";

/** Spinner + stage line, plus a determinate bar once the job knows its total. */
export function JobProgressLine({
  view,
  label,
  live = true,
}: {
  view: JobProgressView;
  label: string;
  /** False when a surrounding element is already the live status region. */
  live?: boolean;
}) {
  return (
    <div role={live ? "status" : undefined} aria-live={live ? "polite" : undefined} className="space-y-1.5">
      <p className="flex items-center gap-2 text-sm text-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
        {view.message}
      </p>
      {view.percent !== null && (
        <Progress
          value={view.percent}
          aria-label={label}
          aria-valuenow={view.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 max-w-sm"
        />
      )}
    </div>
  );
}
