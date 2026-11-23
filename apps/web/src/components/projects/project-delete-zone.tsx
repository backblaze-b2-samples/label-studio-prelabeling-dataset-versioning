"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDeleteProject } from "@/lib/queries";

/** Delete verb: the Label Studio project and the descriptor; B2 data only on request. */
export function ProjectDeleteZone({ slug }: { slug: string }) {
  const router = useRouter();
  const remove = useDeleteProject(slug);
  const [open, setOpen] = useState(false);
  const [purge, setPurge] = useState(false);
  const [typed, setTyped] = useState("");

  const confirm = () =>
    remove.mutate(
      { purgeB2: purge },
      {
        onSuccess: (result) => {
          toast.success(`Project ${slug} deleted`, {
            description: purge
              ? `${result.b2_objects_deleted} B2 objects deleted.`
              : "Its B2 data (images, runs, annotations, releases) was kept.",
          });
          router.push("/projects");
        },
        onError: (error) => toast.error("Could not delete the project", { description: error.message }),
      },
    );

  return (
    <Card className="border-destructive/40">
      <CardHeader className="border-b border-destructive/30 py-4 px-5">
        <CardTitle className="card-title text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-sm font-medium">Delete this project</p>
          <p className="text-xs text-muted-foreground">
            Removes the Label Studio project and its descriptor. B2 data is kept unless you ask.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (remove.isPending) return;
            setOpen(next);
            setTyped("");
            setPurge(false);
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Delete project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {slug}?</DialogTitle>
              <DialogDescription>
                The Label Studio project and its tasks and annotations are deleted there.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                <Label htmlFor="purge-b2" className="text-sm">
                  Also delete this project&apos;s B2 data
                </Label>
                <Switch id="purge-b2" checked={purge} onCheckedChange={setPurge} />
              </div>
              {purge && (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Raw images, pre-label runs, annotations and releases go too</AlertTitle>
                  <AlertDescription>Everything under labeling/*/{slug}/ is deleted. There is no undo.</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="confirm-slug" className="text-sm">
                  Type <code className="font-mono">{slug}</code> to confirm
                </Label>
                <Input id="confirm-slug" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={remove.isPending}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={typed !== slug || remove.isPending} onClick={confirm}>
                {remove.isPending ? "Deleting…" : "Delete project"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
