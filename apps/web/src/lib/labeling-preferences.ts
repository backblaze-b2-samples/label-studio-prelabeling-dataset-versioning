/**
 * Browser-local labeling preferences, honoured for real: the default
 * pre-label threshold pre-selects the "New project" form. Release format is
 * fixed to COCO, so it is shown read-only and never stored.
 *
 * Stored in `localStorage` (there is no account system); Theme stays owned by
 * `next-themes` (see `theme-preference.ts`).
 */

import { APP_SLUG } from "@/lib/app-config";
import { DEFAULT_THRESHOLD, THRESHOLD_OPTIONS, type ThresholdOption } from "@/lib/project-schema";

export interface LabelingPreferences {
  defaultThreshold: ThresholdOption;
}

export const LABELING_PREFERENCES_DEFAULTS: LabelingPreferences = {
  defaultThreshold: DEFAULT_THRESHOLD,
};

/** Namespaced by app slug so two of these apps on one origin cannot collide. */
export const LABELING_PREFERENCES_STORAGE_KEY = `${APP_SLUG}-labeling-preferences`;

function isThreshold(value: unknown): value is ThresholdOption {
  return typeof value === "string" && (THRESHOLD_OPTIONS as readonly string[]).includes(value);
}

/** SSR-safe; tolerates a missing, corrupt or partial blob. */
export function loadLabelingPreferences(): LabelingPreferences {
  if (typeof window === "undefined") return { ...LABELING_PREFERENCES_DEFAULTS };
  try {
    const raw = window.localStorage.getItem(LABELING_PREFERENCES_STORAGE_KEY);
    const stored: unknown = raw ? JSON.parse(raw) : null;
    const s = (typeof stored === "object" && stored !== null ? stored : {}) as Record<string, unknown>;
    return {
      defaultThreshold: isThreshold(s.defaultThreshold)
        ? s.defaultThreshold
        : LABELING_PREFERENCES_DEFAULTS.defaultThreshold,
    };
  } catch {
    return { ...LABELING_PREFERENCES_DEFAULTS };
  }
}

/** False when storage is unavailable, so the caller can say so honestly. */
export function saveLabelingPreferences(values: LabelingPreferences): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(LABELING_PREFERENCES_STORAGE_KEY, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}
