"""Job progress: creates, seeding, pre-label runs and releases report progress, and block duplicates."""

import sys
from pathlib import Path

import pytest

from app.repo import progress, seed_source
from app.service import prelabels, projects, releases, seed
from app.service.errors import ConflictError, DependencyError
from app.types import ProjectCreate, ReleaseCreate

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from annotate_from_prelabels import annotate

# The `loop` fixture swaps seed_project for a fake; keep the real one.
REAL_SEED = seed.seed_project


@pytest.fixture(autouse=True)
def _clean_progress():
    progress.reset()
    yield
    progress.reset()


def _project(loop):
    slug = projects.create_project(ProjectCreate(title="Progress test", labels=["person"])).slug
    projects.sync_project(slug)
    return slug


def test_prelabel_reports_task_progress_then_clears(loop, monkeypatch):
    slug = _project(loop)
    seen = []
    predict = loop.ml.predict

    def spy(tasks, label_config, threshold):
        seen.append(projects.get_progress(slug).prelabel)
        return predict(tasks, label_config, threshold)

    monkeypatch.setattr(loop.ml, "predict", spy)
    monkeypatch.setattr(prelabels.settings, "prelabel_batch_size", 1)
    prelabels.run(slug)

    assert [(p.stage, p.done, p.total) for p in seen] == [
        ("Scoring tasks", 0, 3), ("Scoring tasks", 1, 3), ("Scoring tasks", 2, 3)
    ]
    assert projects.get_progress(slug).prelabel is None


def test_second_prelabel_run_is_refused_while_one_runs(loop):
    slug = _project(loop)
    assert progress.start(progress.PRELABEL, slug, "Scoring tasks", 3)
    with pytest.raises(ConflictError, match="already in progress"):
        prelabels.run(slug)
    progress.finish(progress.PRELABEL, slug)
    assert prelabels.run(slug).tasks == 3


def test_failed_run_clears_progress(loop, monkeypatch):
    slug = _project(loop)
    monkeypatch.setattr(loop.ml, "predict", lambda *a: (_ for _ in ()).throw(RuntimeError("boom")))
    with pytest.raises(DependencyError):
        prelabels.run(slug)
    assert projects.get_progress(slug).prelabel is None


def test_seeding_reports_image_progress(loop, monkeypatch):
    entries = [{"filename": f"img{i}.jpg"} for i in range(3)]
    seen = []
    monkeypatch.setattr(seed_source, "load_catalog", lambda: entries)

    def fetch(entry):
        p = projects.get_progress("seeded").seeding
        seen.append((p.done, p.total, p.stage))
        return b"\xff\xd8\xff"

    monkeypatch.setattr(seed_source, "fetch_seed_image", fetch)
    assert len(REAL_SEED("seeded")) == 3
    stage = "Copying sample images to B2"
    assert seen == [(0, 3, stage), (1, 3, stage), (2, 3, stage)]
    assert projects.get_progress("seeded").seeding is None


@pytest.mark.asyncio
async def test_progress_route(client, loop):
    assert (await client.get("/projects/not-created-yet/progress")).json() == {
        "seeding": None, "prelabel": None, "release": None
    }
    assert (await client.get("/projects/Bad_Slug/progress")).status_code == 400


def test_create_is_listed_while_running_and_blocks_a_duplicate(loop, monkeypatch):
    seen = []
    info = projects.model_info

    def spy():
        seen.append(projects.list_creating())
        with pytest.raises(ConflictError, match="already being created"):
            projects.create_project(ProjectCreate(title="Street scenes", labels=["person"]))
        return info()

    monkeypatch.setattr(projects, "model_info", spy)
    projects.create_project(ProjectCreate(title="Street scenes", labels=["person"]))
    [[creating]] = seen
    assert (creating.slug, creating.title, creating.progress.stage) == (
        "street-scenes", "Street scenes", "Checking the detector's labels"
    )
    assert projects.list_creating() == []


def test_creating_shows_seeding_progress_while_images_copy():
    assert progress.start(progress.CREATE, "batch", "Checking the detector's labels", subject="Batch")
    assert progress.start(progress.SEEDING, "batch", "Copying sample images to B2", 8)
    progress.update(progress.SEEDING, "batch", done=3)
    [creating] = projects.list_creating()
    assert (creating.title, creating.progress.done, creating.progress.total) == ("Batch", 3, 8)


def _annotated_project(loop):
    slug = _project(loop)
    prelabels.run(slug)
    annotate(slug)
    from app.service import annotations

    annotations.sync(slug)
    return slug


def test_release_reports_each_step_then_clears(loop, monkeypatch):
    slug = _annotated_project(loop)
    seen = []
    update = progress.update

    def spy(kind, s, **changes):
        update(kind, s, **changes)
        if kind == progress.RELEASE:
            job = projects.get_progress(s).release
            seen.append((job.done, job.total, job.stage))

    monkeypatch.setattr(progress, "update", spy)
    assert releases.cut_release(slug, ReleaseCreate()).release == "v1"
    total = len(releases.RELEASE_STEPS)
    assert seen == [(i, total, stage) for i, stage in enumerate(releases.RELEASE_STEPS)]
    assert projects.get_progress(slug).release is None


def test_second_release_is_refused_while_one_is_cut(loop):
    slug = _annotated_project(loop)
    assert progress.start(progress.RELEASE, slug, "Loading the project", 8)
    with pytest.raises(ConflictError, match="already being cut"):
        releases.cut_release(slug, ReleaseCreate())
    progress.finish(progress.RELEASE, slug)
    assert releases.cut_release(slug, ReleaseCreate()).release == "v1"


@pytest.mark.asyncio
async def test_project_creates_route(client, loop):
    assert (await client.get("/project-creates")).json() == []
    progress.start(progress.CREATE, "batch", "Checking the detector's labels", subject="Batch")
    [row] = (await client.get("/project-creates")).json()
    assert (row["slug"], row["title"], row["progress"]["stage"]) == ("batch", "Batch", "Checking the detector's labels")
