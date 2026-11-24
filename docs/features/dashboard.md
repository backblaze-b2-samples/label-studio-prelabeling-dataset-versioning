<!-- last_verified: 2026-11-24 -->
# Feature: Dashboard

## Purpose
One glance at the annotation loop across every project: how many tasks exist, how many are annotated, and which releases were cut.

## Used By
- UI: `/` (`StatsCards`, `RecentReleasesTable`)
- API: `GET /dashboard` (`DashboardSummary`) — one call

## Core Functions
- `apps/web/src/components/dashboard/stats-cards.tsx` — `annotatedPercent()`
- `apps/web/src/components/dashboard/recent-releases-table.tsx`
- `services/api/app/service/dashboard.py` — `summary()`: lists the projects, then reads each project's Label Studio task list and release manifests side by side (`service/parallel.py`, 8 threads)
- `apps/web/src/lib/queries.ts` — `useDashboard` (key `qk.dashboard()`, under `qk.projects()`)

## Outputs
- Stat cards: Projects, Tasks, Annotated tasks (with the percent annotated), Releases
- Recent releases (newest 10): project, release, images, annotations (boxes), created

## Flow
- One request returns the totals and the newest 10 releases. It used to be `GET /projects` then a detail and a releases call per project from the browser (1 + 2N requests queued behind the six-connections-per-host limit: 10-14s of skeletons with ~19 projects); server-side it is now ~2-4s on the same bucket
- Only what the dashboard shows is read: no raw-image or pre-label listings
- Any project action invalidates `qk.projects()`, so the dashboard refreshes after a sync, run or release

## Edge Cases
- No projects -> zeros and an empty "No releases yet" state
- A project that cannot be read (Label Studio down) -> its slug is in `unreadable`, totals and recent releases exclude it, and an inline note says the totals are partial

## UX States
- Loading: skeleton values and rows
- Error: ErrorState with retry when the project list itself fails

## Verification
- Test files: `services/api/tests/test_dashboard.py`, `apps/web/src/components/dashboard/stats-cards.test.ts`, `apps/web/src/lib/queries.test.ts`
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_dashboard.py -q` and `pnpm test:web`

## Related Docs
- [Labeling projects](labeling-projects.md), [Dataset releases](dataset-releases.md)
