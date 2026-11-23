import { describe, expect, it } from "vitest";

import { annotatedPercent } from "./stats-cards";

describe("annotatedPercent", () => {
  it("rounds to a whole percent and shows a dash with no tasks", () => {
    expect(annotatedPercent(3, 4)).toBe("75%");
    expect(annotatedPercent(1, 3)).toBe("33%");
    expect(annotatedPercent(0, 0)).toBe("—");
  });
});
