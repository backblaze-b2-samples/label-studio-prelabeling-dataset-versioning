"""Dataset Library route: one page of a project's `labeling/` assets."""

from fastapi import APIRouter

from app.service import library
from app.types import AssetKind, AssetPage

router = APIRouter()


@router.get("/projects/{slug}/assets", response_model=AssetPage)
def list_assets(
    slug: str,
    kind: AssetKind = "raw",
    run: str | None = None,
    release: str | None = None,
    cursor: str | None = None,
):
    return library.assets(slug, kind, run=run, release=release, cursor=cursor)
