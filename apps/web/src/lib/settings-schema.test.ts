import { zodResolver } from "@hookform/resolvers/zod";
import { describe, expect, it } from "vitest";

import { settingsSchema, type SettingsValues } from "@/lib/settings-schema";

const valid: SettingsValues = { theme: "dark", defaultThreshold: "0.5" };

describe("settingsSchema", () => {
  it("accepts a valid form through the resolver the form runs", async () => {
    const result = await zodResolver(settingsSchema)(valid, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect(result.errors).toEqual({});
    expect(result.values).toEqual(valid);
  });

  it("rejects values outside the offered options", () => {
    expect(settingsSchema.safeParse({ ...valid, theme: "sepia" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...valid, defaultThreshold: "0.9" }).success).toBe(false);
  });
});
