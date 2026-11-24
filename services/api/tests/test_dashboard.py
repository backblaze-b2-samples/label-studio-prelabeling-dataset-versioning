"""Dashboard aggregation: one call, totals across projects, newest releases first."""

import sys
from pathlib import Path

import pytest

from app.service import annotations, dashboard, prelabels, projects, releases
from app.service.parallel import parallel_map
from app.types import ProjectCreate, ReleaseCreate

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from annotate_from_prelabels import annotate


def _released(title: str, cuts: int) -> str:
    slug = projects.create_project(ProjectCreate(title=title, labels=["person"])).slug
    projects.sync_project(slug)
    prelabels.run(slug)
    annotate(slug)
    annotations.sync(slug)
    for _ in range(cuts):
        releases.cut_release(slug, ReleaseCreate())
    return slug


def test_summary_totals_every_project(loop):
    a = _released("Batch A", 1)
    b = _released("Batch B", 2)
    projects.create_project(ProjectCreate(title="Empty", labels=["person"], seed_sample_images=False))

    summary = dashboard.summary()
    assert (summary.projects, summary.tasks, summary.annotated_tasks, summary.releases) == (3, 6, 6, 3)
    assert summary.unreadable == []
    assert [(r.project, r.release) for r in summary.recent_releases] == [(b, "v2"), (b, "v1"), (a, "v1")]


def test_unreadable_project_is_named_not_fatal(loop, monkeypatch):
    slug = _released("Batch A", 1)
    from app.repo.upstream import UpstreamServiceError

    def down(_project_id):
        raise UpstreamServiceError("Label Studio", "GET /api/tasks/ failed: refused")

    monkeypatch.setattr(loop.ls, "list_tasks", down)
    summary = dashboard.summary()
    assert (summary.projects, summary.tasks, summary.releases, summary.unreadable) == (1, 0, 0, [slug])


@pytest.mark.asyncio
async def test_dashboard_route(client, loop):
    body = (await client.get("/dashboard")).json()
    assert body == {
        "projects": 0, "tasks": 0, "annotated_tasks": 0, "releases": 0, "unreadable": [], "recent_releases": []
    }


def test_parallel_map_keeps_order_and_raises():
    assert parallel_map(lambda x: x * 2, range(20)) == [x * 2 for x in range(20)]
    with pytest.raises(ValueError):
        parallel_map(lambda x: (_ for _ in ()).throw(ValueError("boom")) if x == 3 else x, range(5))
