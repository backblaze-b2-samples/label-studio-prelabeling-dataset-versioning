"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { DatasetRelease, VerificationReport } from "@label-studio-prelabeling-dataset-versioning/shared";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { previewHref } from "@/lib/preview-deep-link";
import { useVerifyRelease } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import { VerificationPanel } from "./verification-panel";

/** Releases are immutable: the only action is re-verifying one from B2. */
export function ReleasesTable({ slug, releases }: { slug: string; releases: DatasetRelease[] }) {
  const verify = useVerifyRelease(slug);
  const [report, setReport] = useState<VerificationReport | null>(null);

  return (
    <div className="space-y-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Release</TableHead>
            <TableHead>Images</TableHead>
            <TableHead>Boxes</TableHead>
            <TableHead>Pre-label run</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {releases.map((release) => (
            <TableRow key={release.release}>
              <TableCell className="font-mono text-xs">
                <Link className="underline-offset-4 hover:underline" href={previewHref(`${release.prefix}manifest.json`)}>
                  {release.release}
                </Link>
                {release.notes && <p className="mt-0.5 font-sans text-xs text-muted-foreground">{release.notes}</p>}
              </TableCell>
              <TableCell className="tabular-nums">{release.images}</TableCell>
              <TableCell className="tabular-nums">{release.annotations}</TableCell>
              <TableCell className="font-mono text-xs">{release.prelabel_run_id ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(release.created_at)}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={verify.isPending}
                  onClick={() =>
                    verify.mutate(release.release, {
                      onSuccess: setReport,
                      onError: (e) => toast.error("Re-verification failed", { description: e.message }),
                    })
                  }
                >
                  {verify.isPending && verify.variables === release.release ? "Verifying…" : "Re-verify"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {report && <VerificationPanel report={report} />}
    </div>
  );
}
