import { describe, expect, it } from "vitest";

import { createProgressCopy, creatingRowView, SLOW_CREATE_MS } from "@/lib/project-create-progress";

describe("createProgressCopy", () => {
  it("names the stages and the elapsed time", () => {
    const copy = createProgressCopy(3_400, true);
    expect(copy.message).toMatch(/^Copying the 8 sample images/);
    expect(copy.message).toMatch(/3s$/);
    expect(copy.hint).toBeNull();
  });

  it("skips the seed stage when not seeding", () => {
    expect(createProgressCopy(0, false).message).toMatch(/^Connecting Label Studio/);
  });

  it("explains a long wait and that the dialog can be closed", () => {
    const copy = createProgressCopy(SLOW_CREATE_MS, true);
    expect(copy.hint).toMatch(/minute or two/);
    expect(copy.hint).toMatch(/close this dialog/);
    expect(createProgressCopy(SLOW_CREATE_MS, false).hint).not.toMatch(/seed/);
  });
});

describe("creatingRowView", () => {
  const create = (done: number, total: number, stage: string) => ({
    slug: "street-scenes",
    title: "Street scenes",
    progress: { stage, done, total, subject: "Street scenes", started_at: "2026-11-24T00:00:00Z" },
  });

  it("names the project and counts the seed images", () => {
    expect(creatingRowView(create(3, 8, "Copying sample images to B2"))).toEqual({
      message: "Creating Street scenes: Copying sample images to B2… 3 of 8",
      percent: 38,
    });
  });

  it("stays indeterminate for the Label Studio step", () => {
    expect(creatingRowView(create(0, 0, "Connecting Label Studio's storages and the ML backend")).percent).toBeNull();
  });
});
