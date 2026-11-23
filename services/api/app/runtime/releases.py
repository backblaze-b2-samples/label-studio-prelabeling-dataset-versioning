"""Dataset release routes. Releases are immutable: there is no edit or delete."""

from fastapi import APIRouter

from app.service import release_checks, releases
from app.types import DatasetRelease, ReleaseBlocked, ReleaseCreate, VerificationReport

router = APIRouter()


@router.get("/projects/{slug}/releases", response_model=list[DatasetRelease])
def list_releases(slug: str):
    return releases.list_releases(slug)


@router.post(
    "/projects/{slug}/releases",
    response_model=DatasetRelease,
    status_code=201,
    responses={409: {"model": ReleaseBlocked}},
)
def create_release(slug: str, req: ReleaseCreate):
    return releases.cut_release(slug, req)


@router.get("/projects/{slug}/releases/{release}", response_model=DatasetRelease)
def get_release(slug: str, release: str):
    return releases.get_release(slug, release)


@router.post("/projects/{slug}/releases/{release}/verify", response_model=VerificationReport)
def verify_release(slug: str, release: str):
    return release_checks.verify_release(slug, release)
