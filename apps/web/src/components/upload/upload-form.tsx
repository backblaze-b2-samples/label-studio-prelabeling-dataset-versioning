"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dropzone } from "./dropzone";
import { UploadProgress } from "./upload-progress";
import { useProjects } from "@/lib/queries";
import { useUploadQueue } from "@/lib/upload-queue-context";
import { uploadQueueSummary } from "@/lib/upload-status";

/**
 * Thin view over the app-wide queue in `UploadQueueProvider`, plus the
 * required project selector: every image lands in `labeling/raw/<project>/`.
 *
 * The queue deliberately does NOT live here: component-local state was lost the
 * moment the user navigated away, which hid in-flight uploads and disarmed the
 * duplicate-upload guard.
 */
export function UploadForm() {
  const { addFiles, addRejections, clearCompleted, items, retry, uploading } = useUploadQueue();
  const projects = useProjects();
  const [project, setProject] = useState("");

  useEffect(() => {
    const fromUrl = new URL(window.location.href).searchParams.get("project");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL after hydration (the page is prerendered, so the URL is not known at render)
    if (fromUrl) setProject(fromUrl);
  }, []);

  const hasCompleted = items.some((i) => i.status === "complete" || i.status === "error");
  const summary = uploadQueueSummary(items);
  const noProjects = projects.data?.length === 0;

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Upload raw images</CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="upload-project">Project</Label>
          <Select value={project} onValueChange={setProject} disabled={uploading}>
            <SelectTrigger id="upload-project" className="w-72" aria-label="Project">
              <SelectValue placeholder={projects.isLoading ? "Loading projects…" : "Pick a project"} />
            </SelectTrigger>
            <SelectContent>
              {(projects.data ?? []).map((p) => (
                <SelectItem key={p.slug} value={p.slug}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {project ? (
              <>
                Images go to <code className="font-mono">labeling/raw/{project}/</code>.
              </>
            ) : noProjects ? (
              <>
                No projects yet. <Link className="underline underline-offset-4" href="/projects">Create one first</Link>.
              </>
            ) : (
              "Required: each image belongs to one labeling project."
            )}
          </p>
        </div>
        <Dropzone
          onFilesSelected={(files) => addFiles(files, project)}
          onFilesRejected={addRejections}
          disabled={uploading || !project}
          disabledReason={
            !uploading && !project
              ? { title: "Pick a project first", description: "Each image goes to one project's raw prefix." }
              : undefined
          }
        />
        <p className="text-xs text-muted-foreground">Sync the project to turn new images into tasks.</p>
        {summary && (
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium">Upload queue</p>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {summary}
            </p>
          </div>
        )}
        <UploadProgress disabled={uploading} items={items} onRetry={retry} />
        {hasCompleted && !uploading && (
          <div className="flex justify-end">
            <Button aria-label="Clear completed and failed uploads" variant="outline" size="sm" onClick={clearCompleted}>
              Clear finished
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
