"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import type { LabelingProject } from "@label-studio-prelabeling-dataset-versioning/shared";

import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/common/segmented-control";
import {
  THRESHOLD_OPTIONS,
  projectUpdateSchema,
  toThresholdOption,
  type ProjectUpdateValues,
} from "@/lib/project-schema";
import { useUpdateProject } from "@/lib/queries";

export function ProjectEditDialog({ project }: { project: LabelingProject }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateProject(project.slug);
  const form = useForm<ProjectUpdateValues>({ resolver: zodResolver(projectUpdateSchema) });

  useEffect(() => {
    if (open) {
      form.reset({
        title: project.title,
        description: project.description,
        threshold: toThresholdOption(project.threshold),
      });
    }
  }, [open, form, project]);

  const onSubmit = (values: ProjectUpdateValues) =>
    update.mutate(
      { title: values.title.trim(), description: values.description, threshold: Number(values.threshold) },
      {
        onSuccess: () => {
          toast.success("Project updated");
          setOpen(false);
        },
        onError: (error) => toast.error("Could not update the project", { description: error.message }),
      },
    );

  return (
    <Dialog open={open} onOpenChange={(next) => !update.isPending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>Title and description also update the Label Studio project.</DialogDescription>
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
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>The slug and B2 prefixes do not change.</FormDescription>
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
                    <Textarea className="resize-none" {...field} />
                  </FormControl>
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
                  <FormDescription>Used by the next pre-label run.</FormDescription>
                </FormItem>
              )}
            />
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Labels</p>
              <div className="flex flex-wrap gap-1.5">
                {project.labels.map((label) => (
                  <Badge key={label} variant="secondary">
                    {label}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Labels are fixed after creation because Label Studio rejects a config that drops labels
                existing annotations use. Create a new project to change them.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={update.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
