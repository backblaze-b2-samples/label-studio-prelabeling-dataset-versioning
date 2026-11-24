"""In-process progress of long-running project jobs (create, seeding, pre-label runs, releases).

The jobs themselves stay synchronous requests; they report how far they got
here, and `GET /projects/{slug}/progress` reads it back so the web app can show
"N of M" and recognise a run that is still going after a page reload.

Scope: one API process, like the rate limiter. A restart forgets running jobs
(their requests die with it anyway), and several replicas would each keep their
own map; a shared store (Redis) is the swap-in for that. See docs/RELIABILITY.md.
"""

from datetime import UTC, datetime
from threading import Lock

from app.types import JobProgress

CREATE = "create"
SEEDING = "seeding"
PRELABEL = "prelabel"
RELEASE = "release"

_lock = Lock()
_jobs: dict[tuple[str, str], JobProgress] = {}


def start(kind: str, slug: str, stage: str, total: int = 0, subject: str | None = None) -> bool:
    """Register a job. False if one of the same kind is already running for `slug`."""
    with _lock:
        if (kind, slug) in _jobs:
            return False
        _jobs[(kind, slug)] = JobProgress(
            stage=stage, done=0, total=total, subject=subject, started_at=datetime.now(UTC)
        )
        return True


def update(kind: str, slug: str, **changes: str | int) -> None:
    """Move a running job on (`stage`, `done`, `total`); a no-op once it finished."""
    with _lock:
        job = _jobs.get((kind, slug))
        if job is not None:
            _jobs[(kind, slug)] = job.model_copy(update=changes)


def finish(kind: str, slug: str) -> None:
    with _lock:
        _jobs.pop((kind, slug), None)


def get(kind: str, slug: str) -> JobProgress | None:
    with _lock:
        return _jobs.get((kind, slug))


def running(kind: str) -> list[tuple[str, JobProgress]]:
    """Every `(slug, job)` of one kind in flight, oldest first."""
    with _lock:
        jobs = [(slug, job) for (k, slug), job in _jobs.items() if k == kind]
    return sorted(jobs, key=lambda item: item[1].started_at)


def reset() -> None:
    """Forget every job. Used by tests to stay hermetic."""
    with _lock:
        _jobs.clear()
