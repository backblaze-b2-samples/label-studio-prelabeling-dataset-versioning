"use client";

import Link from "next/link";
import { ArrowRight, PackageOpen } from "lucide-react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProjects, useReleasesFor } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export function RecentReleasesTable() {
  const projects = useProjects();
  const results = useReleasesFor((projects.data ?? []).map((p) => p.slug));
  const loading = projects.isLoading || results.some((r) => r.isLoading);
  const releases = results
    .flatMap((r) => r.data ?? [])
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);

  return (
    <Card>
      <CardHeader className="border-b border-border px-5 py-4">
        <CardTitle className="card-title">Recent releases</CardTitle>
        <CardAction className="self-center">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            All projects
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : projects.error ? (
          <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
        ) : releases.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            title="No releases yet"
            description="Create a project, pre-label, correct in Label Studio, then cut a release."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Project</TableHead>
                <TableHead>Release</TableHead>
                <TableHead>Images</TableHead>
                <TableHead>Annotations</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {releases.map((release) => (
                <TableRow key={`${release.project}/${release.release}`} className="table-row-hover">
                  <TableCell>
                    <Link className="underline-offset-4 hover:underline" href={`/projects/${release.project}`}>
                      {release.project}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{release.release}</TableCell>
                  <TableCell className="tabular-nums">{release.images}</TableCell>
                  <TableCell className="tabular-nums">{release.annotations}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(release.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
