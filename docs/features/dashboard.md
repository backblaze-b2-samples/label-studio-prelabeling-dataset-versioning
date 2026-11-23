<!-- last_verified: 2026-11-23 -->
# Feature: Dashboard

## Purpose
One glance at the annotation loop across every project: how many tasks exist, how many are annotated, and which releases were cut.

## Used By
- UI: `/` (`StatsCards`, `RecentReleasesTable`)
- API: `GET /projects`, `GET /projects/{slug}` per project, `GET /projects/{slug}/releases` per project

## Core Functions
- `apps/web/src/components/dashboard/stats-cards.tsx` — `annotatedPercent()`
- `apps/web/src/components/dashboard/recent-releases-table.tsx`
- `apps/web/src/lib/queries.ts` — `useProjects`, `useProjectDetails`, `useReleasesFor` (TanStack `useQueries`)

## Outputs
- Stat cards: Projects, Tasks, Annotated tasks (with the percent annotated), Releases
- Recent releases (newest 10): project, release, images, annotations (boxes), created

## Flow
- The project list loads first; each project's detail and releases load in parallel and share their cache with the project pages
- Any project action invalidates `qk.projects()`, so the dashboard refreshes after a sync, run or release

## Edge Cases
- No projects -> zeros and an empty "No releases yet" state
- A project whose detail fails (Label Studio down) -> totals exclude it and an inline note says the totals are partial

## UX States
- Loading: skeleton values and rows
- Error: ErrorState with retry when the project list itself fails

## Verification
- Test files: `apps/web/src/components/dashboard/stats-cards.test.ts`, `apps/web/src/lib/queries.test.ts`
- Focused verify command: `pnpm test:web`

## Related Docs
- [Labeling projects](labeling-projects.md), [Dataset releases](dataset-releases.md)
