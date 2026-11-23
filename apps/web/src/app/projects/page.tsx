import { ProjectCreateDialog } from "@/components/projects/project-create-dialog";
import { ProjectList } from "@/components/projects/project-list";

export default function ProjectsPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="page-title">Labeling projects</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            Each project is a Label Studio project whose source storage reads raw images from B2 and whose
            target storage writes annotations back to the same bucket.
          </p>
        </div>
        <ProjectCreateDialog />
      </div>
      <div className="animate-fade-in-up stagger-2">
        <ProjectList />
      </div>
    </div>
  );
}
