import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { addRunToCache, dropDeletedFileFromCache, projectKeys, qk } from "@/lib/queries";
import type {
  FileMetadata,
  PrelabelRun,
  ProjectDetail,
} from "@label-studio-prelabeling-dataset-versioning/shared";

function file(key: string): FileMetadata {
  return {
    key,
    filename: key.split("/").pop() ?? key,
    folder: "uploads/",
    size_bytes: 10,
    size_human: "10 B",
    content_type: "text/plain",
    uploaded_at: "2026-07-28T00:00:00Z",
    url: null,
  };
}

describe("dropDeletedFileFromCache", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient();
  });

  it("removes the deleted row from the default list", () => {
    qc.setQueryData(qk.files(), [file("uploads/a.txt"), file("uploads/b.txt")]);

    dropDeletedFileFromCache(qc, "uploads/a.txt");

    expect(qc.getQueryData<FileMetadata[]>(qk.files())).toEqual([
      file("uploads/b.txt"),
    ]);
  });

  it("removes it from every cached prefix/limit variant", () => {
    qc.setQueryData(qk.files(), [file("uploads/a.txt")]);
    qc.setQueryData(qk.files("uploads/", 100), [file("uploads/a.txt")]);
    qc.setQueryData(qk.files("", 25), [file("uploads/a.txt")]);

    dropDeletedFileFromCache(qc, "uploads/a.txt");

    expect(qc.getQueryData<FileMetadata[]>(qk.files())).toEqual([]);
    expect(qc.getQueryData<FileMetadata[]>(qk.files("uploads/", 100))).toEqual(
      [],
    );
    expect(qc.getQueryData<FileMetadata[]>(qk.files("", 25))).toEqual([]);
  });

  it("evicts the deleted key's presigned URL and detail so Preview can't 404", () => {
    qc.setQueryData(qk.preview("uploads/a.txt"), { url: "https://signed" });
    qc.setQueryData(qk.detail("uploads/a.txt"), { md5: "abc" });

    dropDeletedFileFromCache(qc, "uploads/a.txt");

    expect(qc.getQueryData(qk.preview("uploads/a.txt"))).toBeUndefined();
    expect(qc.getQueryData(qk.detail("uploads/a.txt"))).toBeUndefined();
  });

  it("leaves other files' cached previews alone", () => {
    qc.setQueryData(qk.preview("uploads/b.txt"), { url: "https://signed-b" });

    dropDeletedFileFromCache(qc, "uploads/a.txt");

    expect(qc.getQueryData(qk.preview("uploads/b.txt"))).toEqual({
      url: "https://signed-b",
    });
  });

  it("does not touch stats or project caches", () => {
    qc.setQueryData(qk.stats(), { total_files: 2 });
    qc.setQueryData(projectKeys.detail("street"), { counts: { tasks: 3 } });

    dropDeletedFileFromCache(qc, "uploads/a.txt");

    expect(qc.getQueryData(qk.stats())).toEqual({ total_files: 2 });
    expect(qc.getQueryData(projectKeys.detail("street"))).toEqual({ counts: { tasks: 3 } });
  });

  it("is a no-op for an unseeded cache", () => {
    expect(() =>
      dropDeletedFileFromCache(qc, "uploads/missing.txt"),
    ).not.toThrow();
    expect(qc.getQueryData(qk.files())).toBeUndefined();
  });
});

describe("projectKeys", () => {
  it("scopes every project key by slug under qk.projects()", () => {
    const root = qk.projects();
    for (const key of [
      projectKeys.detail("a"),
      projectKeys.runs("a"),
      projectKeys.releases("a"),
      projectKeys.verification("a"),
      projectKeys.assets("a", "raw"),
    ]) {
      expect(key.slice(0, root.length)).toEqual([...root]);
      expect(key.at(-1)).toBe("a");
    }
    expect(projectKeys.detail("a")).not.toEqual(projectKeys.detail("b"));
  });

  it("invalidating qk.projects() reaches a project's detail", async () => {
    const qc = new QueryClient();
    qc.setQueryData(projectKeys.detail("a"), { ok: true });
    await qc.invalidateQueries({ queryKey: qk.projects() });
    expect(qc.getQueryState(projectKeys.detail("a"))?.isInvalidated).toBe(true);
  });
});

describe("addRunToCache", () => {
  const run = { run_id: "20261124T000000Z-rtdetr-r18", tasks: 8 } as PrelabelRun;

  it("updates the Overview counts and latest run at once", () => {
    const qc = new QueryClient();
    const detail = {
      counts: { raw_objects: 8, tasks: 8, annotated_tasks: 0, prelabel_runs: 0, releases: 0 },
      latest_run: null,
    } as unknown as ProjectDetail;
    qc.setQueryData(projectKeys.detail("demo"), detail);
    qc.setQueryData(projectKeys.runs("demo"), []);

    addRunToCache(qc, "demo", run);

    const updated = qc.getQueryData<ProjectDetail>(projectKeys.detail("demo"));
    expect(updated?.counts.prelabel_runs).toBe(1);
    expect(updated?.latest_run).toBe(run);
    expect(qc.getQueryData(projectKeys.runs("demo"))).toEqual([run]);
  });

  it("leaves an uncached project alone", () => {
    const qc = new QueryClient();
    addRunToCache(qc, "demo", run);
    expect(qc.getQueryData(projectKeys.detail("demo"))).toBeUndefined();
  });
});
