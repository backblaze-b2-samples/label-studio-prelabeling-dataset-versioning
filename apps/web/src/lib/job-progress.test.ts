import { describe, expect, it } from "vitest";

import {
  annotationSyncProgressMessage,
  jobProgressView,
  releaseProgressView,
  syncProgressMessage,
} from "@/lib/job-progress";

const job = (done: number, total: number, stage = "Scoring tasks") => ({
  stage,
  done,
  total,
  subject: null,
  started_at: "2026-11-24T00:00:00Z",
});

describe("jobProgressView", () => {
  it("shows N of M and a percentage", () => {
    expect(jobProgressView(job(3, 8))).toEqual({ message: "Scoring tasks… 3 of 8", percent: 38 });
  });

  it("stays indeterminate while the total is unknown", () => {
    expect(jobProgressView(job(0, 0, "Listing tasks in Label Studio"))).toEqual({
      message: "Listing tasks in Label Studio…",
      percent: null,
    });
  });

  it("never reports past 100%", () => {
    expect(jobProgressView(job(9, 8)).percent).toBe(100);
  });
});

describe("releaseProgressView", () => {
  it("names the current step, the elapsed seconds and a step-based percentage", () => {
    expect(releaseProgressView(job(2, 8, "Reading the annotation objects on B2"), 12_700)).toEqual({
      message: "Step 3 of 8: Reading the annotation objects on B2… 12s",
      percent: 25,
    });
  });

  it("stays indeterminate until the server reports the release", () => {
    expect(releaseProgressView(null, 900)).toEqual({ message: "Starting the release… 0s", percent: null });
  });

  it("never names a step past the last", () => {
    expect(releaseProgressView(job(8, 8, "Writing manifest.json"), 0).message).toMatch(/^Step 8 of 8/);
  });
});

describe("sync stage lines", () => {
  it("name the B2 prefix Label Studio is working on and the elapsed seconds", () => {
    expect(syncProgressMessage("labeling/raw/demo/", 6_200)).toBe(
      "Label Studio is scanning labeling/raw/demo/ on B2 and adding a task for each new image… 6s",
    );
    expect(annotationSyncProgressMessage("labeling/annotations/demo/", 3_000)).toMatch(
      /^Label Studio is writing annotations to labeling\/annotations\/demo\/ on B2.*3s$/,
    );
  });
});
