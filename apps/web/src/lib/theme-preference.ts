/**
 * The one preference this app genuinely honours.
 *
 * `next-themes` owns and persists the theme, so there is nothing to store here
 * — only the option list and the coercion the Settings form needs.
 *
 * The other preference on the Settings page, the default pre-label threshold,
 * lives in `labeling-preferences.ts` (localStorage only). Keep this module
 * about the theme. See `docs/features/settings.md`.
 */

export const THEME_OPTIONS = ["light", "dark", "system"] as const;

export type ThemeOption = (typeof THEME_OPTIONS)[number];

export const DEFAULT_THEME: ThemeOption = "system";

export function isThemeOption(value: unknown): value is ThemeOption {
  return (
    typeof value === "string" &&
    (THEME_OPTIONS as readonly string[]).includes(value)
  );
}

/**
 * Coerce whatever `next-themes` reports into a value the radio group can show.
 * It is `undefined` during the first client paint and could be any string from
 * a stale storage entry.
 */
export function normalizeTheme(value: string | undefined): ThemeOption {
  return isThemeOption(value) ? value : DEFAULT_THEME;
}
