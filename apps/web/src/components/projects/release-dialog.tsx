"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PackageCheck } from "lucide-react";
import { toast } from "sonner";
import type { FlaggedTask } from "@label-studio-prelabeling-dataset-versioning/shared";

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
import { releaseSchema, type ReleaseValues } from "@/lib/project-schema";
import { useCreateRelease } from "@/lib/queries";
import { FlaggedTable } from "./verification-panel";

export function ReleaseDialog({ slug, releaseCount }: { slug: string; releaseCount: number }) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState<{ detail: string; flagged: FlaggedTask[] } | null>(null);
  const create = useCreateRelease(slug);
  const form = useForm<ReleaseValues>({ resolver: zodResolver(releaseSchema), defaultValues: { name: "", notes: "" } });
  const suggested = `v${releaseCount + 1}`;


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
        <Button size="sm" className="h-8">
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
        {blocked && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Release refused</AlertTitle>
            <AlertDescription>{blocked.detail}</AlertDescription>
          </Alert>
        )}
        {blocked && <FlaggedTable flagged={blocked.flagged} />}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
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
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Writing release…" : "Cut release"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
