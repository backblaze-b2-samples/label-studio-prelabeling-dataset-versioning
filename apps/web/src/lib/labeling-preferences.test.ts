import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LABELING_PREFERENCES_DEFAULTS,
  LABELING_PREFERENCES_STORAGE_KEY,
  loadLabelingPreferences,
  saveLabelingPreferences,
} from "./labeling-preferences";

function installStorage(): Record<string, string> {
  const store: Record<string, string> = {};
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    },
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("labeling preferences", () => {
  it("defaults to a 0.5 threshold, also without a window", () => {
    expect(loadLabelingPreferences()).toEqual(LABELING_PREFERENCES_DEFAULTS);
    expect(LABELING_PREFERENCES_DEFAULTS.defaultThreshold).toBe("0.5");
  });

  it("round-trips a saved threshold", () => {
    installStorage();
    expect(saveLabelingPreferences({ defaultThreshold: "0.7" })).toBe(true);
    expect(loadLabelingPreferences()).toEqual({ defaultThreshold: "0.7" });
  });

  it("falls back on an invalid or corrupt blob", () => {
    const store = installStorage();
    store[LABELING_PREFERENCES_STORAGE_KEY] = JSON.stringify({ defaultThreshold: "0.9" });
    expect(loadLabelingPreferences()).toEqual(LABELING_PREFERENCES_DEFAULTS);
    store[LABELING_PREFERENCES_STORAGE_KEY] = "{not json";
    expect(loadLabelingPreferences()).toEqual(LABELING_PREFERENCES_DEFAULTS);
  });
});
