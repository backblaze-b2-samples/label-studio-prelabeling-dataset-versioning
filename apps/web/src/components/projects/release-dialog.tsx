"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import type { FlaggedTask, ProjectCounts } from "@label-studio-prelabeling-dataset-versioning/shared";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useElapsedMs } from "@/hooks/use-elapsed";
import { releaseProgressView } from "@/lib/job-progress";
import { releaseBlockers } from "@/lib/project-next-step";
import { releaseSchema, type ReleaseValues } from "@/lib/project-schema";
import { useCreateRelease, useProjectProgress } from "@/lib/queries";
import { JobProgressLine } from "./job-progress-line";
import { FlaggedTable } from "./verification-panel";

interface ReleaseDialogProps {
  slug: string;
  counts: ProjectCounts;
  /** Solid primary styling when cutting a release is the loop's next step. */
  primary?: boolean;
}

export function ReleaseDialog({ slug, counts, primary = false }: ReleaseDialogProps) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState<{ detail: string; flagged: FlaggedTask[] } | null>(null);
  const create = useCreateRelease(slug);
  const form = useForm<ReleaseValues>({ resolver: zodResolver(releaseSchema), defaultValues: { name: "", notes: "" } });
  const suggested = `v${counts.releases + 1}`;
  // Pre-check from the counts already on the page; the server still re-verifies B2.
  const blockers = releaseBlockers(counts);
  // The server reports each release step (`GET /projects/{slug}/progress`),
  // polled only while this dialog is writing; the clock adds elapsed seconds.
  const elapsed = useElapsedMs(create.submittedAt, create.isPending);
  const serverRelease = useProjectProgress(slug, { poll: create.isPending, enabled: create.isPending }).data?.release ?? null;

  const onSubmit = (values: ReleaseValues) =>
    create.mutate(
      { name: values.name.trim() || null, notes: values.notes.trim() || null },
      {
        onSuccess: (release) => {
          toast.success(`Release ${release.release} written to B2`, {
            description: `${release.images} images, ${release.annotations} boxes under ${release.prefix}`,
          });
          setOpen(false);
        },
        onError: (error) => {
          if (error.isConflict) setBlocked({ detail: error.message, flagged: error.flagged });
          else toast.error("Could not cut the release", { description: error.message });
        },
      },
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (create.isPending) return;
        if (next) {
          form.reset({ name: "", notes: "" });
          setBlocked(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={primary ? "default" : "outline"} className="h-8">
          <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Cut release
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cut an immutable release</DialogTitle>
          <DialogDescription>
            Builds COCO from the annotation objects on B2, cross-checks Label Studio&apos;s export, and
            writes manifest.json last. A release cannot be changed afterwards.
          </DialogDescription>
        </DialogHeader>
        {!blocked && blockers.length > 0 && (
          <Alert role="status">
            <AlertTitle>Not ready to release yet</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-0.5 pl-4">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="mt-1">A release needs a pre-label and an annotation on B2 for every task.</p>
            </AlertDescription>
          </Alert>
        )}
        {blocked && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Release refused</AlertTitle>
            <AlertDescription>{blocked.detail}</AlertDescription>
          </Alert>
        )}
        {blocked && <FlaggedTable flagged={blocked.flagged} />}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" aria-busy={create.isPending}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder={suggested} autoComplete="off" {...field} />
                  </FormControl>
                  <FormDescription>Leave empty for {suggested}.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="What changed in this release" className="resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending || blockers.length > 0}>
                {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {create.isPending ? "Writing release…" : "Cut release"}
              </Button>
            </DialogFooter>
            {create.isPending && (
              <div className="rounded-md border border-border p-3">
                <JobProgressLine label="Release progress" view={releaseProgressView(serverRelease, elapsed)} />
              </div>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
