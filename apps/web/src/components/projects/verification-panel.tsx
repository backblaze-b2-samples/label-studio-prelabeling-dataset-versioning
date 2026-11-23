"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import type { FlaggedTask, VerificationReport } from "@label-studio-prelabeling-dataset-versioning/shared";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const REASON_TEXT: Record<string, string> = {
  missing_annotation: "no annotation",
  missing_prelabel: "no pre-label in the latest run",
  missing_source_object: "raw image missing on B2",
  missing_in_export: "annotated in Label Studio, not on B2 yet (Sync annotations)",
  missing_task: "raw image not synced into a task",
};

export function FlaggedTable({ flagged }: { flagged: FlaggedTask[] }) {
  if (flagged.length === 0) return null;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          <TableHead>Raw image</TableHead>
          <TableHead>Why it is flagged</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {flagged.map((f) => (
          <TableRow key={`${f.task_id}-${f.source_key}`}>
            <TableCell className="font-mono text-xs">{f.task_id ?? "—"}</TableCell>
            <TableCell className="max-w-64 truncate font-mono text-xs" title={f.source_key ?? ""}>
              {f.source_key ?? "—"}
            </TableCell>
            <TableCell className="text-xs">{f.reasons.map((r) => REASON_TEXT[r] ?? r).join("; ")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function VerificationPanel({ report }: { report: VerificationReport }) {
  const c = report.counts;
  const rows: [string, number][] = [
    ["Raw images on B2", c.raw_objects],
    ["Label Studio tasks", c.tasks],
    ["Tasks with a pre-label", c.tasks_with_prelabels],
    ["Tasks with an annotation on B2", c.tasks_with_annotations],
    ["Annotation objects on B2", c.annotation_objects],
    ["Boxes", c.boxes],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="status">
        <Badge variant={report.status === "complete" ? "default" : "destructive"}>{report.status}</Badge>
        <span className="text-sm text-muted-foreground">
          {report.release ? `Release ${report.release}` : "Live project check"}
          {report.prelabel_run_id ? ` · pre-label run ${report.prelabel_run_id}` : " · no pre-label run yet"}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-md border border-border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {report.checks.length > 0 && (
        <ul className="space-y-1.5">
          {report.checks.map((check) => (
            <li key={check.name} className="flex items-start gap-2 text-sm">
              {check.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" aria-label="passed" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="failed" />
              )}
              <span>
                <span className="font-medium">{check.name}</span>{" "}
                <span className="text-muted-foreground">— {check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <FlaggedTable flagged={report.flagged} />
    </div>
  );
}
