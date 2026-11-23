"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AssetKind } from "@/lib/api-client";
import { previewHref } from "@/lib/preview-deep-link";
import { useAssets, useProjects } from "@/lib/queries";
import { formatDate, humanizeBytes } from "@/lib/utils";

const KINDS: { value: AssetKind; label: string }[] = [
  { value: "raw", label: "Raw images" },
  { value: "prelabels", label: "Pre-label runs" },
  { value: "annotations", label: "Annotations" },
  { value: "exports", label: "Releases" },
];
const ALL = "__all__";

function Status({ value, yes, no }: { value: boolean | null; yes: string; no: string }) {
  if (value === null) return null;
  return <Badge variant={value ? "secondary" : "outline"}>{value ? yes : no}</Badge>;
}

/**
 * The sample's own explorer, scoped to `labeling/`. Rows deep-link to the
 * bucket explorer (`/files?preview=<key>`) for preview and download, so the
 * preview code lives in one place.
 */
export function LibraryBrowser() {
  const projects = useProjects();
  const [project, setProject] = useState("");
  const [kind, setKind] = useState<AssetKind>("raw");
  const [group, setGroup] = useState(ALL);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);

  // Deep links from the project page: /library?project=<slug>&kind=…&run=…
  // One-time sync from the URL after hydration: the page is prerendered, so
  // the URL is unknown at render time.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const fromUrl = params.get("project");
    const kindFromUrl = params.get("kind") as AssetKind | null;
    if (fromUrl) setProject(fromUrl);
    if (kindFromUrl && KINDS.some((k) => k.value === kindFromUrl)) setKind(kindFromUrl);
    const groupFromUrl = params.get("run") ?? params.get("release");
    if (groupFromUrl) setGroup(groupFromUrl);
  }, []);

  // Default to the newest project once the list arrives.
  useEffect(() => {
    if (!project && projects.data?.length) setProject(projects.data[0].slug);
  }, [project, projects.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const cursor = cursors.at(-1);
  const filter = group === ALL ? {} : kind === "prelabels" ? { run: group } : kind === "exports" ? { release: group } : {};
  const page = useAssets(project, kind, { ...filter, cursor });

  const changeKind = (value: string) => {
    setKind(value as AssetKind);
    setGroup(ALL);
    setCursors([undefined]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={project}
          onValueChange={(value) => {
            setProject(value);
            setGroup(ALL);
            setCursors([undefined]);
          }}
        >
          <SelectTrigger className="w-64" aria-label="Project">
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
        <Tabs value={kind} onValueChange={changeKind}>
          <TabsList>
            {KINDS.map((k) => (
              <TabsTrigger key={k.value} value={k.value}>
                {k.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {(kind === "prelabels" || kind === "exports") && (
          <Select
            value={group}
            onValueChange={(value) => {
              setGroup(value);
              setCursors([undefined]);
            }}
          >
            <SelectTrigger className="w-72" aria-label={kind === "prelabels" ? "Run" : "Release"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{kind === "prelabels" ? "All runs" : "All releases"}</SelectItem>
              {[...new Set([...(page.data?.groups ?? []), ...(group !== ALL ? [group] : [])])].map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {projects.data?.length === 0 ? (
            <EmptyState icon={FolderSearch} title="No projects yet" description="Create a project first." />
          ) : page.isLoading || !project ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : page.error ? (
            <ErrorState error={page.error} onRetry={() => page.refetch()} />
          ) : (page.data?.items ?? []).length === 0 ? (
            <EmptyState icon={FolderSearch} title="Nothing here yet" description={`No objects under ${page.data?.prefix}.`} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>B2 key</TableHead>
                  {(kind === "prelabels" || kind === "exports") && <TableHead>{kind === "prelabels" ? "Run" : "Release"}</TableHead>}
                  {kind === "raw" && <TableHead>Status</TableHead>}
                  <TableHead>Size</TableHead>
                  <TableHead>Last modified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.data?.items.map((item) => (
                  <TableRow key={item.key} className="table-row-hover">
                    <TableCell className="max-w-md truncate font-mono text-xs" title={item.key}>
                      <Link className="underline-offset-4 hover:underline" href={previewHref(item.key)}>
                        {item.key}
                      </Link>
                    </TableCell>
                    {(kind === "prelabels" || kind === "exports") && (
                      <TableCell className="font-mono text-xs">{item.group ?? "—"}</TableCell>
                    )}
                    {kind === "raw" && (
                      <TableCell className="space-x-1.5 whitespace-nowrap">
                        <Status value={item.prelabel_status} yes="pre-labelled" no="no pre-label" />
                        <Status value={item.annotation_status} yes="annotated" no="not annotated" />
                      </TableCell>
                    )}
                    <TableCell className="tabular-nums text-muted-foreground">{humanizeBytes(item.size_bytes)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(item.last_modified)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={cursors.length <= 1} onClick={() => setCursors((c) => c.slice(0, -1))}>
          Previous page
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!page.data?.next_cursor}
          onClick={() => setCursors((c) => [...c, page.data?.next_cursor ?? undefined])}
        >
          Next page
        </Button>
      </div>
    </div>
  );
}
