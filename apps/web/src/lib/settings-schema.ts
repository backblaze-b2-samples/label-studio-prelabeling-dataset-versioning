import { z } from "zod";

import { THRESHOLD_OPTIONS } from "@/lib/project-schema";
import { THEME_OPTIONS } from "@/lib/theme-preference";

/**
 * Validation for the Settings form (`components/settings/settings-form.tsx`).
 * See `docs/features/settings.md`.
 */
export const settingsSchema = z.object({
  theme: z.enum(THEME_OPTIONS),
  defaultThreshold: z.enum(THRESHOLD_OPTIONS),
});

export type SettingsValues = z.infer<typeof settingsSchema>;
