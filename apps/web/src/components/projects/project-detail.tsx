"use client";

import { useState } from "react";
import Link from "next/link";
import { History, Loader2, PackageOpen, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { prelabelFailureHint } from "@/lib/project-next-step";
import { usePrelabelRuns, useProject, useReleases, useVerification } from "@/lib/queries";
import { ProjectActions } from "./project-actions";
import { ProjectDeleteZone } from "./project-delete-zone";
import { ProjectEditDialog } from "./project-edit-dialog";
import { ReleasesTable } from "./releases-table";
import { RunsTable } from "./runs-table";
import { VerificationPanel } from "./verification-panel";

export function ProjectDetailView({ slug }: { slug: string }) {
  const [tab, setTab] = useState("overview");
  const [prelabelFailure, setPrelabelFailure] = useState<string | null>(null);
  const detail = useProject(slug);
  const runs = usePrelabelRuns(slug);
  const releases = useReleases(slug);
  const verification = useVerification(slug, { enabled: tab === "verification" });

  if (detail.isLoading) return <Skeleton className="h-64 w-full" />;
  if (detail.error || !detail.data) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;

  const { project, counts, latest_run, latest_release } = detail.data;
  const stats: [string, number][] = [
    ["Raw images", counts.raw_objects],
    ["Tasks", counts.tasks],
    ["Annotated tasks", counts.annotated_tasks],
    ["Pre-label runs", counts.prelabel_runs],
    ["Releases", counts.releases],
  ];

  return (
    <div className="space-y-6">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title">{project.title}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{project.slug}</p>
          {project.description && <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">{project.description}</p>}
        </div>
        <ProjectEditDialog project={project} />
      </div>

      <ProjectActions
        project={project}
        counts={counts}
        latestRelease={latest_release}
        latestRunId={latest_run?.run_id ?? null}
        onVerify={() => {
          setTab("verification");
          void verification.refetch();
        }}
        verifying={verification.isFetching}
        onPrelabelFailure={setPrelabelFailure}
      />

      {prelabelFailure && (
        <Alert variant="destructive" role="alert" className="relative pr-10">
          <AlertTitle>The last pre-label run failed</AlertTitle>
          <AlertDescription>
            <p>{prelabelFailureHint(prelabelFailure)}</p>
            <p className="mt-1 break-all font-mono text-xs opacity-80">{prelabelFailure}</p>
          </AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1.5 top-1.5 h-7 w-7"
            aria-label="Dismiss"
            onClick={() => setPrelabelFailure(null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="runs">Pre-label runs</TabsTrigger>
          <TabsTrigger value="releases">Releases</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-md border border-border p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="stat-value">{value}</dd>
              </div>
            ))}
          </dl>
          <Card>
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle className="card-title">Where this project lives on B2</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-5 text-sm">
              <p>
                Source storage (raw images): <code className="font-mono">{project.source_prefix}</code>
              </p>
              <p>
                Target storage (annotations): <code className="font-mono">{project.target_prefix}</code>
              </p>
              <p>
                Model: <code className="font-mono">{project.model_id}</code> · threshold {project.threshold}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {project.labels.map((label) => (
                  <Badge key={label} variant="secondary">
                    {label}
                  </Badge>
                ))}
              </div>
              <p className="pt-2 text-muted-foreground">
                Latest run:{" "}
                {latest_run ? (
                  <code className="font-mono">{latest_run.run_id}</code>
                ) : prelabelFailure ? (
                  "last attempt failed (see above)"
                ) : (
                  "none yet"
                )}{" "}
                ·
                Latest release: {latest_release ? <code className="font-mono">{latest_release.release}</code> : "none yet"} ·{" "}
                <Link className="underline underline-offset-4" href={`/library?project=${encodeURIComponent(slug)}`}>
                  Browse in the Library
                </Link>
              </p>
            </CardContent>
          </Card>
          <ProjectDeleteZone slug={slug} />
        </TabsContent>

        <TabsContent value="runs" className="pt-4">
          {runs.error ? (
            <ErrorState error={runs.error} onRetry={() => runs.refetch()} />
          ) : (runs.data ?? []).length === 0 ? (
            <EmptyState
              icon={History}
              title={prelabelFailure ? "The last pre-label run failed" : "No pre-label runs yet"}
              description={prelabelFailure ? prelabelFailureHint(prelabelFailure) : "Sync from B2, then Run pre-labels."}
            />
          ) : (
            <RunsTable slug={slug} runs={runs.data ?? []} />
          )}
        </TabsContent>

        <TabsContent value="releases" className="pt-4">
          {releases.error ? (
            <ErrorState error={releases.error} onRetry={() => releases.refetch()} />
          ) : (releases.data ?? []).length === 0 ? (
            <EmptyState
              icon={PackageOpen}
              title="No releases yet"
              description="Cut a release once every task has an annotation on B2."
            />
          ) : (
            <ReleasesTable slug={slug} releases={releases.data ?? []} />
          )}
        </TabsContent>

        <TabsContent value="verification" className="pt-4">
          {verification.isFetching ? (
            <p role="status" aria-busy="true" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
              Comparing raw images, tasks, pre-labels and annotations on B2 and in Label Studio…
            </p>
          ) : verification.error ? (
            <ErrorState error={verification.error} onRetry={() => verification.refetch()} />
          ) : verification.data ? (
            <VerificationPanel report={verification.data} />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
