import { describe, expect, it } from "vitest";

import { nextLoopStep, prelabelFailureHint, releaseBlockers, releaseIsCurrent } from "@/lib/project-next-step";

const counts = (over: Partial<Parameters<typeof nextLoopStep>[0]> = {}) => ({
  raw_objects: 8,
  tasks: 8,
  annotated_tasks: 8,
  prelabel_runs: 1,
  releases: 0,
  ...over,
});

describe("nextLoopStep", () => {
  it("follows the loop in order", () => {
    expect(nextLoopStep(counts({ raw_objects: 0, tasks: 0 })).step).toBe("upload");
    expect(nextLoopStep(counts({ tasks: 0, annotated_tasks: 0, prelabel_runs: 0 })).step).toBe("sync");
    expect(nextLoopStep(counts({ tasks: 5 })).step).toBe("sync");
    expect(nextLoopStep(counts({ prelabel_runs: 0, annotated_tasks: 0 })).step).toBe("prelabel");
    expect(nextLoopStep(counts({ annotated_tasks: 3 })).step).toBe("annotate");
    expect(nextLoopStep(counts()).step).toBe("release");
  });

  it("names how much is left", () => {
    expect(nextLoopStep(counts({ annotated_tasks: 7 })).hint).toMatch(/^1 task still/);
    expect(nextLoopStep(counts({ tasks: 5 })).hint).toMatch(/^3 raw images on B2 have/);
  });
});

const release = (over: Record<string, unknown> = {}) => ({
  project: "demo",
  release: "v1",
  prefix: "labeling/exports/demo/v1/",
  created_at: "2026-11-24T00:00:00Z",
  notes: null,
  images: 8,
  annotations: 20,
  prelabel_run_id: "run-1",
  manifest: null,
  ...over,
});

describe("nextLoopStep done state", () => {
  it("is done when the latest release covers every annotated task of the latest run", () => {
    const next = nextLoopStep(counts({ releases: 1 }), release(), "run-1");
    expect(next.step).toBe("done");
    expect(next.title).toBe("release v1 is on B2");
    expect(next.manifestKey).toBe("labeling/exports/demo/v1/manifest.json");
  });

  it("asks for a new release once anything changed since", () => {
    expect(nextLoopStep(counts({ releases: 1 }), release({ images: 6 }), "run-1").step).toBe("release");
    expect(nextLoopStep(counts({ releases: 1 }), release(), "run-2").step).toBe("release");
    expect(nextLoopStep(counts({ raw_objects: 9, releases: 1 }), release(), "run-1").step).toBe("sync");
    expect(nextLoopStep(counts({ annotated_tasks: 7, releases: 1 }), release(), "run-1").step).toBe("annotate");
    expect(nextLoopStep(counts()).step).toBe("release");
  });

  it("releaseIsCurrent needs a release and tasks", () => {
    expect(releaseIsCurrent(counts(), null, "run-1")).toBe(false);
    expect(releaseIsCurrent(counts({ tasks: 0, raw_objects: 0, annotated_tasks: 0 }), release({ images: 0 }), null)).toBe(false);
  });
});

describe("releaseBlockers", () => {
  it("is empty when every task is annotated", () => {
    expect(releaseBlockers(counts())).toEqual([]);
  });

  it("explains a premature release", () => {
    const blockers = releaseBlockers(counts({ prelabel_runs: 0, annotated_tasks: 0 }));
    expect(blockers).toHaveLength(2);
    expect(blockers[1]).toMatch(/8 tasks of 8 are not annotated/);
  });
});

describe("prelabelFailureHint", () => {
  it("points a rejected predict at the ML backend logs", () => {
    expect(prelabelFailureHint("ML backend: POST /predict returned 400: {...}")).toMatch(/logs ml-backend/);
  });

  it("points an unreachable backend at docker compose", () => {
    expect(prelabelFailureHint("ML backend: GET /info failed: connection refused")).toMatch(/docker compose up/);
  });
});
