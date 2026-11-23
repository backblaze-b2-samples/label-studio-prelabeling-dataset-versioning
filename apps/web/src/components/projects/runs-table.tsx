"use client";

import Link from "next/link";
import type { PrelabelRun } from "@label-studio-prelabeling-dataset-versioning/shared";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export function RunsTable({ slug, runs }: { slug: string; runs: PrelabelRun[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Run</TableHead>
          <TableHead>Tasks</TableHead>
          <TableHead>Boxes</TableHead>
          <TableHead>Threshold</TableHead>
          <TableHead>Device</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Started</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.run_id}>
            <TableCell className="font-mono text-xs">
              <Link
                className="underline-offset-4 hover:underline"
                href={`/library?project=${encodeURIComponent(slug)}&kind=prelabels&run=${encodeURIComponent(run.run_id)}`}
              >
                {run.run_id}
              </Link>
            </TableCell>
            <TableCell className="tabular-nums">{run.tasks}</TableCell>
            <TableCell className="tabular-nums">{run.boxes}</TableCell>
            <TableCell className="tabular-nums">{run.threshold}</TableCell>
            <TableCell>{run.device}</TableCell>
            <TableCell className="tabular-nums">{run.duration_seconds}s</TableCell>
            <TableCell className="text-muted-foreground">{formatDate(run.started_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
