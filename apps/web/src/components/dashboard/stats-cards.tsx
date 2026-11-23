"use client";

import { CheckSquare, ListTodo, PackageCheck, Tags } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectDetails, useProjects } from "@/lib/queries";

/** Annotated share as a whole percent; "—" while there are no tasks. */
export function annotatedPercent(annotated: number, tasks: number): string {
  return tasks > 0 ? `${Math.round((annotated / tasks) * 100)}%` : "—";
}

export function StatsCards() {
  const projects = useProjects();
  const slugs = (projects.data ?? []).map((p) => p.slug);
  const details = useProjectDetails(slugs);

  if (projects.error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
        </CardContent>
      </Card>
    );
  }

  const loading = projects.isLoading || details.some((d) => d.isLoading);
  const counts = details.flatMap((d) => (d.data ? [d.data.counts] : []));
  const tasks = counts.reduce((sum, c) => sum + c.tasks, 0);
  const annotated = counts.reduce((sum, c) => sum + c.annotated_tasks, 0);
  const releases = counts.reduce((sum, c) => sum + c.releases, 0);
  const failed = details.filter((d) => d.error).length;

  const cards = [
    { title: "Projects", value: slugs.length, icon: Tags, hint: null },
    { title: "Tasks", value: tasks, icon: ListTodo, hint: null },
    { title: "Annotated tasks", value: annotated, icon: CheckSquare, hint: annotatedPercent(annotated, tasks) },
    { title: "Releases", value: releases, icon: PackageCheck, hint: null },
  ];

  return (
    <div className="space-y-2">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <Card key={card.title} className={`card-hover animate-fade-in-up stagger-${i + 1}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pt-4 pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">{card.title}</CardTitle>
              <div className="stat-icon-wrap">
                <card.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-5">
              {loading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="stat-value">{card.value}</span>
                  {card.hint && <span className="text-sm text-muted-foreground">{card.hint}</span>}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {failed > 0 && (
        <p role="alert" className="text-xs text-[var(--attention)]">
          {failed} project(s) could not be read (is Label Studio running?), so totals are partial.
        </p>
      )}
    </div>
  );
}
