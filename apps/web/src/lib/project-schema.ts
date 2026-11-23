import { z } from "zod";

/**
 * Validation for the labeling-project forms (create, edit) and the release
 * form. Kept outside the components so the rules are unit-tested without
 * rendering. The server re-validates everything (`services/api/app/types/`).
 */

/** The finite threshold choices the segmented control offers. */
export const THRESHOLD_OPTIONS = ["0.3", "0.5", "0.7"] as const;
export type ThresholdOption = (typeof THRESHOLD_OPTIONS)[number];
export const DEFAULT_THRESHOLD: ThresholdOption = "0.5";

/** Pre-selected labels on the create form (all present in the COCO set). */
export const DEFAULT_LABELS = ["person", "car", "bicycle", "bus"];

/** Same derivation as `services/api/app/service/keys.py::slugify`. */
export function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;
export const RELEASE_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export const projectCreateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters")
    .max(80, "Title must be 80 characters or fewer")
    .refine((t) => SLUG_RE.test(slugFromTitle(t)), "Use letters or digits so the title gives a usable slug"),
  description: z.string().max(500, "Description must be 500 characters or fewer"),
  labels: z.array(z.string()).min(1, "Pick at least one label"),
  threshold: z.enum(THRESHOLD_OPTIONS),
  seedSampleImages: z.boolean(),
});
export type ProjectCreateValues = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = z.object({
  title: projectCreateSchema.shape.title,
  description: projectCreateSchema.shape.description,
  threshold: z.enum(THRESHOLD_OPTIONS),
});
export type ProjectUpdateValues = z.infer<typeof projectUpdateSchema>;

export const releaseSchema = z.object({
  name: z
    .string()
    .trim()
    .refine((v) => v === "" || RELEASE_RE.test(v), "Use a-z, 0-9, '.', '_' or '-' (max 64), e.g. v2"),
  notes: z.string().max(500, "Notes must be 500 characters or fewer"),
});
export type ReleaseValues = z.infer<typeof releaseSchema>;

/** Nearest offered option for a stored threshold (edit form pre-fill). */
export function toThresholdOption(value: number): ThresholdOption {
  return THRESHOLD_OPTIONS.reduce((best, option) =>
    Math.abs(Number(option) - value) < Math.abs(Number(best) - value) ? option : best,
  );
}
