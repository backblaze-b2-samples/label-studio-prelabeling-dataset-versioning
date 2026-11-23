import Link from "next/link";
import { Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentReleasesTable } from "@/components/dashboard/recent-releases-table";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Labeling projects, annotation progress and dataset releases, all stored on Backblaze B2.
          </p>
        </div>
        <Button asChild size="sm" className="h-8">
          <Link href="/projects">
            <Tags className="h-3.5 w-3.5" />
            Labeling projects
          </Link>
        </Button>
      </div>
      <StatsCards />
      <div className="animate-fade-in-up stagger-3">
        <RecentReleasesTable />
      </div>
    </div>
  );
}
