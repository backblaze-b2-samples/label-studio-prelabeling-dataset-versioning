"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/common/segmented-control";
import { loadLabelingPreferences } from "@/lib/labeling-preferences";
import { API_BASE, ApiError } from "@/lib/api-client";
import { jobProgressView } from "@/lib/job-progress";
import { createProgressCopy } from "@/lib/project-create-progress";
import {
  DEFAULT_LABELS,
  DEFAULT_THRESHOLD,
  THRESHOLD_OPTIONS,
  projectCreateSchema,
  slugFromTitle,
  type ProjectCreateValues,
} from "@/lib/project-schema";
import { useCreateProject, useModels, useProjectProgress } from "@/lib/queries";
import { JobProgressLine } from "./job-progress-line";

// Slugs of creates whose dialog was closed mid-request. Module scope (not a
// ref) because the create outlives this component when the user navigates.
const backgrounded = new Set<string>();
const createToastId = (slug: string) => `create-project-${slug}`;

const DEFAULTS: ProjectCreateValues = {
  title: "",
  description: "",
  labels: DEFAULT_LABELS,
  threshold: DEFAULT_THRESHOLD,
  seedSampleImages: true,
};

export function ProjectCreateDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const models = useModels();
  const create = useCreateProject();
  const form = useForm<ProjectCreateValues>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: DEFAULTS,
  });
  const title = useWatch({ control: form.control, name: "title" });
  const slug = slugFromTitle(title ?? "");
  // Closing the dialog mid-create does not cancel it: the request keeps
  // running and a toast (global, so it survives navigation) reports the end.
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!create.isPending) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [create.isPending]);
  const progress = createProgressCopy(
    Math.max(0, now - create.submittedAt),
    create.variables?.seed_sample_images ?? false,
  );
  // The server counts the seed images it has copied; poll that while creating.
  const creatingSlug = create.isPending ? slugFromTitle(create.variables?.title ?? "") : "";
  const seeding = useProjectProgress(creatingSlug, { poll: true, enabled: create.isPending }).data?.seeding ?? null;
  // Status 0 = the browser never got an answer from the API (down, or its CORS
  // does not allow this origin); anything else came back from the API itself.
  const apiUnreachable = models.error instanceof ApiError && models.error.status === 0;

  // The saved default threshold (Settings) pre-selects the control on open.
  useEffect(() => {
    if (open) form.reset({ ...DEFAULTS, threshold: loadLabelingPreferences().defaultThreshold });
  }, [open, form]);

  const available = models.data?.labels ?? [];

  const onSubmit = (values: ProjectCreateValues) => {
    const pendingSlug = slugFromTitle(values.title);
    backgrounded.delete(pendingSlug);
    // mutateAsync, not mutate(..., callbacks): per-call callbacks are dropped
    // once this component unmounts, and a backgrounded create must still report.
    create
      .mutateAsync({
        title: values.title.trim(),
        description: values.description,
        labels: values.labels,
        threshold: Number(values.threshold),
        seed_sample_images: values.seedSampleImages,
      })
      .then((project) => {
        const href = `/projects/${project.slug}`;
        const bg = backgrounded.delete(pendingSlug);
        toast.success(`Project ${project.slug} created`, {
          id: createToastId(pendingSlug),
          description: "Label Studio is connected to B2. Next: Sync from B2.",
          action: bg ? { label: "Open", onClick: () => router.push(href) } : undefined,
        });
        if (!bg) {
          setOpen(false);
          router.push(href);
        }
      })
      .catch((error: Error) => {
        backgrounded.delete(pendingSlug);
        toast.error("Could not create the project", { id: createToastId(pendingSlug), description: error.message });
      });
  };

  const onOpenChange = (next: boolean) => {
    const pendingSlug = slugFromTitle(create.variables?.title ?? "");
    if (!next && create.isPending && !backgrounded.has(pendingSlug)) {
      backgrounded.add(pendingSlug);
      toast.loading(`Creating project ${pendingSlug} in the background…`, {
        id: createToastId(pendingSlug),
        description: "Keep working; this notice updates when the project is ready.",
      });
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New labeling project</DialogTitle>
          <DialogDescription>
            Creates a Label Studio project whose source and target storage are this B2 bucket.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Street scenes, batch 1" autoComplete="off" {...field} />
                  </FormControl>
                  <FormDescription>
                    Slug <code className="font-mono">{slug || "…"}</code> · raw images in{" "}
                    <code className="font-mono">labeling/raw/{slug || "<slug>"}/</code>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="What this batch is for" className="resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="labels"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Labels</FormLabel>
                  {models.isLoading ? (
                    <p className="text-xs text-muted-foreground">Loading the model&apos;s label set…</p>
                  ) : models.error && apiUnreachable ? (
                    <p role="alert" className="text-xs text-destructive">
                      This page cannot reach the API at <code>{API_BASE}</code>, so the labels cannot be listed. Start
                      it with <code>pnpm dev</code>; if it is running, its <code>API_CORS_ORIGINS</code> must allow{" "}
                      <code>{typeof window === "undefined" ? "this origin" : window.location.origin}</code>.
                    </p>
                  ) : models.error ? (
                    <p role="alert" className="text-xs text-destructive">
                      The ML backend is not reachable, so its labels cannot be listed. Run{" "}
                      <code>docker compose up -d</code> and reopen this dialog.
                    </p>
                  ) : (
                    <div
                      role="group"
                      aria-label="Labels"
                      className="grid max-h-44 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-3"
                    >
                      {available.map((label) => (
                        <label key={label} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={field.value.includes(label)}
                            onCheckedChange={(checked) =>
                              field.onChange(
                                checked ? [...field.value, label] : field.value.filter((l) => l !== label),
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  )}
                  <FormDescription>
                    From the model&apos;s label set. Fixed after creation.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="threshold"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pre-label confidence threshold</FormLabel>
                  <FormControl>
                    <SegmentedControl
                      ariaLabel="Pre-label confidence threshold"
                      options={THRESHOLD_OPTIONS}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>0.5 is a sound default; lower adds more boxes to correct.</FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="seedSampleImages"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-md border border-border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Seed sample images</FormLabel>
                    <FormDescription>
                      Copies the 8 CC0 sample images into this project&apos;s raw prefix.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {create.isPending ? "Continue in background" : "Cancel"}
              </Button>
              <Button type="submit" disabled={create.isPending || !!models.error}>
                {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {create.isPending ? "Creating…" : "Create project"}
              </Button>
            </DialogFooter>
            {create.isPending && (
              <div role="status" aria-live="polite" className="space-y-1 rounded-md border border-border p-3 text-xs">
                {seeding ? (
                  <JobProgressLine live={false} label="Sample images copied" view={jobProgressView(seeding)} />
                ) : (
                  <p className="flex items-center gap-2 text-foreground">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
                    {progress.message}
                  </p>
                )}
                {progress.hint && <p className="text-muted-foreground">{progress.hint}</p>}
              </div>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
