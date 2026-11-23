"use client";

import Link from "next/link";
import { Tags } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProjects } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export function ProjectList() {
  const { data: projects = [], isLoading, error, refetch } = useProjects();

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : projects.length === 0 ? (
          <EmptyState
            icon={Tags}
            title="No labeling projects yet"
            description="Create one: it connects Label Studio to this bucket and can seed 8 CC0 sample images."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Project</TableHead>
                <TableHead>Labels</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead>Raw prefix</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.slug} className="table-row-hover">
                  <TableCell>
                    <Link href={`/projects/${project.slug}`} className="font-medium underline-offset-4 hover:underline">
                      {project.title}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{project.slug}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-72 flex-wrap gap-1">
                      {project.labels.map((label) => (
                        <Badge key={label} variant="secondary">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{project.threshold}</TableCell>
                  <TableCell className="font-mono text-xs">{project.source_prefix}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(project.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
