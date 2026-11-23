<!-- last_verified: 2026-11-23 -->
# Feature: Settings

## Purpose
Hold the few preferences this app genuinely honours — theme and the default pre-label threshold — and show which companion services the API can reach.

## Used By
- UI: `/settings` page (`SettingsForm`, `DangerZone`)
- API: `GET /health` (read-only service URLs and status)
- Storage: `next-themes`' own key for Theme; `localStorage` (`<app slug>-labeling-preferences`) for the default threshold. There is no account system and no server-side preferences store

## Core Functions
- `apps/web/src/lib/theme-preference.ts` — Theme (owned by `next-themes`)
- `apps/web/src/lib/labeling-preferences.ts` — `loadLabelingPreferences()`, `saveLabelingPreferences()`
- `apps/web/src/lib/settings-schema.ts` — zod rules, tested in `settings-schema.test.ts`
- `apps/web/src/components/settings/settings-form.tsx` — the form
- `apps/web/src/components/settings/danger-zone.tsx` — the kit's demo "Empty bucket" action (no real delete runs; project deletion lives on the project page)

## Inputs
- theme: `"light" | "dark" | "system"` (real)
- defaultThreshold: `"0.3" | "0.5" | "0.7"` via a segmented control, default `0.5` (real: pre-selects the "New project" form)
- Default release format: fixed to COCO, shown read-only — there is nothing to choose
- Label Studio URL and ML backend URL: read-only from `/health`; change them in `.env`

## Outputs
- Theme applied immediately; threshold saved to this browser

## Edge Cases
- Storage blocked (private mode) -> theme still applies; a warning toast says the threshold was not stored
- Corrupt or unknown stored value -> falls back to `0.5`
- API down -> service rows show "unknown"

## UX States
- Loading: form renders defaults, then hydrates from storage once the theme resolves
- Error: services card shows "down" badges with the configured URLs

## Verification
- Test files: `apps/web/src/lib/settings-schema.test.ts`, `apps/web/src/lib/labeling-preferences.test.ts`
- Focused verify command: `pnpm test:web`

## Related Docs
- [Labeling projects](labeling-projects.md), [docs/app-workflows.md](../app-workflows.md)
