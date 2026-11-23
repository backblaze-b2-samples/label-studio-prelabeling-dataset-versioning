import { describe, expect, it } from "vitest";

import {
  projectCreateSchema,
  projectUpdateSchema,
  releaseSchema,
  slugFromTitle,
  toThresholdOption,
} from "@/lib/project-schema";

const valid = {
  title: "Street scenes, batch 1",
  description: "",
  labels: ["person"],
  threshold: "0.5" as const,
  seedSampleImages: true,
};

describe("slugFromTitle", () => {
  it("matches the backend slug rule", () => {
    expect(slugFromTitle("Street scenes, batch 1")).toBe("street-scenes-batch-1");
    expect(slugFromTitle("  --Hello__World--  ")).toBe("hello-world");
    expect(slugFromTitle("x".repeat(60))).toHaveLength(48);
  });
});

describe("projectCreateSchema", () => {
  it("accepts a valid form", () => {
    expect(projectCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("requires at least one label", () => {
    const result = projectCreateSchema.safeParse({ ...valid, labels: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Pick at least one label");
  });

  it("only allows the offered thresholds", () => {
    expect(projectCreateSchema.safeParse({ ...valid, threshold: "0.4" }).success).toBe(false);
  });

  it("rejects a title that gives no usable slug", () => {
    expect(projectCreateSchema.safeParse({ ...valid, title: "!!" }).success).toBe(false);
  });
});

describe("projectUpdateSchema", () => {
  it("has no labels field: labels are fixed after creation", () => {
    expect(Object.keys(projectUpdateSchema.shape)).toEqual(["title", "description", "threshold"]);
  });
});

describe("releaseSchema", () => {
  it("allows an empty name (server picks v<N+1>) and valid names", () => {
    expect(releaseSchema.safeParse({ name: "", notes: "" }).success).toBe(true);
    expect(releaseSchema.safeParse({ name: "v2.1", notes: "" }).success).toBe(true);
    expect(releaseSchema.safeParse({ name: "V2", notes: "" }).success).toBe(false);
    expect(releaseSchema.safeParse({ name: "a/b", notes: "" }).success).toBe(false);
  });
});

describe("toThresholdOption", () => {
  it("snaps to the nearest offered option", () => {
    expect(toThresholdOption(0.5)).toBe("0.5");
    expect(toThresholdOption(0.25)).toBe("0.3");
    expect(toThresholdOption(0.9)).toBe("0.7");
  });
});
