"""Dashboard totals across every project, in one request.

The dashboard used to fetch `GET /projects`, then every project's detail and
releases from the browser: 1 + 2N requests that queued behind the browser's
six-connections-per-host limit. Here the per-project reads (Label Studio's
task list and the release manifests on B2) run side by side on the server, and
only what the dashboard shows is read — no raw-image or pre-label listings.
"""

import logging

from app.service import descriptors, releases
from app.service.deps import label_studio, upstream
from app.service.errors import DependencyError
from app.service.parallel import parallel_map
from app.types import DashboardSummary, DatasetRelease, ProjectDescriptor

logger = logging.getLogger(__name__)
RECENT_RELEASES = 10


def _read(descriptor: ProjectDescriptor) -> tuple[int, int, list[DatasetRelease]] | None:
    """(tasks, annotated tasks, releases) for one project; None if unreadable."""
    try:
        with upstream():
            tasks = label_studio().list_tasks(descriptor.label_studio_project_id)
        annotated = sum(1 for t in tasks if int(t.get("total_annotations") or 0) > 0)
        return len(tasks), annotated, releases.list_releases(descriptor.slug)
    except DependencyError as e:
        logger.warning("Dashboard could not read project %s: %s", descriptor.slug, e.detail)
        return None


def summary() -> DashboardSummary:
    projects = descriptors.list_all()
    results = parallel_map(_read, projects)
    readable = [r for r in results if r is not None]
    every_release = [rel for _, _, rels in readable for rel in rels]
    return DashboardSummary(
        projects=len(projects),
        tasks=sum(r[0] for r in readable),
        annotated_tasks=sum(r[1] for r in readable),
        releases=len(every_release),
        unreadable=[d.slug for d, r in zip(projects, results, strict=True) if r is None],
        recent_releases=sorted(every_release, key=lambda r: r.created_at, reverse=True)[:RECENT_RELEASES],
    )
