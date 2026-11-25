"""Copy the pinned CC0 seed images into a project's raw prefix on B2."""

import logging

from app.repo import b2_objects, progress, seed_source
from app.service import keys
from app.service.deps import upstream
from app.service.errors import ConflictError

logger = logging.getLogger(__name__)


def catalog() -> list[dict]:
    return seed_source.load_catalog()


def seed_project(slug: str, limit: int | None = None) -> list[str]:
    """Upload up to `limit` seed images to `labeling/raw/<slug>/`. Returns the keys."""
    keys.validate_project_slug(slug)
    entries = catalog()[:limit] if limit else catalog()
    written: list[str] = []
    total = len(entries)
    if not progress.start(progress.SEEDING, slug, "Copying sample images to B2", total):
        raise ConflictError(f"Sample images are already being copied into {keys.raw_prefix(slug)}")
    try:
        with upstream():
            for entry in entries:
                data = seed_source.fetch_seed_image(entry)
                key = keys.raw_key(slug, entry["filename"])
                b2_objects.put_bytes(key, data, "image/jpeg")
                written.append(key)
                progress.update(progress.SEEDING, slug, done=len(written))
    finally:
        progress.finish(progress.SEEDING, slug)
    logger.info("Seeded %d CC0 images into %s", len(written), keys.raw_prefix(slug))
    return written
