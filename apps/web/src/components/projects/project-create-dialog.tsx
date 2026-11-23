"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
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
import {
  DEFAULT_LABELS,
  DEFAULT_THRESHOLD,
  THRESHOLD_OPTIONS,
  projectCreateSchema,
  slugFromTitle,
  type ProjectCreateValues,
} from "@/lib/project-schema";
import { useCreateProject, useModels } from "@/lib/queries";

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

  // The saved default threshold (Settings) pre-selects the control on open.
  useEffect(() => {
    if (open) form.reset({ ...DEFAULTS, threshold: loadLabelingPreferences().defaultThreshold });
  }, [open, form]);

  const available = models.data?.labels ?? [];

  const onSubmit = (values: ProjectCreateValues) => {
    create.mutate(
      {
        title: values.title.trim(),
        description: values.description,
        labels: values.labels,
        threshold: Number(values.threshold),
        seed_sample_images: values.seedSampleImages,
      },
      {
        onSuccess: (project) => {
          toast.success(`Project ${project.slug} created`, {
            description: "Label Studio is connected to B2. Next: Sync from B2.",
          });
          setOpen(false);
          router.push(`/projects/${project.slug}`);
        },
        onError: (error) => toast.error("Could not create the project", { description: error.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && setOpen(next)}>
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending || !!models.error}>
                {create.isPending ? "Creating…" : "Create project"}
              </Button>
            </DialogFooter>
            {create.isPending && (
              <p role="status" className="text-xs text-muted-foreground">
                Connecting Label Studio to B2{form.getValues("seedSampleImages") ? " and copying the sample images" : ""}
                . The first seed downloads the images once, so it can take a minute.
              </p>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
