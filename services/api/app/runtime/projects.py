"""Labeling project routes: lifecycle, sync, pre-label runs, annotations, verification.

Sync `def` handlers on purpose: every call below blocks on Label Studio, the
ML backend or B2, and Starlette runs sync handlers in its threadpool.
"""

from fastapi import APIRouter

from app.service import annotations, prelabels, projects, verification
from app.types import (
    AnnotationSyncResult,
    LabelingProject,
    ModelInfo,
    PrelabelRun,
    PrelabelRunCreate,
    ProjectCreate,
    ProjectDeleted,
    ProjectDetail,
    ProjectUpdate,
    ReleaseBlocked,
    SyncResult,
    VerificationReport,
)

router = APIRouter()
_CONFLICT = {409: {"model": ReleaseBlocked}}


@router.get("/models", response_model=ModelInfo)
def get_model():
    return projects.model_info()


@router.get("/projects", response_model=list[LabelingProject])
def list_projects():
    return projects.list_projects()


@router.post("/projects", response_model=LabelingProject, status_code=201, responses=_CONFLICT)
def create_project(req: ProjectCreate):
    return projects.create_project(req)


@router.get("/projects/{slug}", response_model=ProjectDetail)
def get_project(slug: str):
    return projects.get_detail(slug)


@router.patch("/projects/{slug}", response_model=LabelingProject)
def update_project(slug: str, req: ProjectUpdate):
    return projects.update_project(slug, req)


@router.delete("/projects/{slug}", response_model=ProjectDeleted)
def delete_project(slug: str, purge_b2: bool = False):
    return projects.delete_project(slug, purge_b2)


@router.post("/projects/{slug}/sync", response_model=SyncResult, responses=_CONFLICT)
def sync_project(slug: str):
    return projects.sync_project(slug)


@router.get("/projects/{slug}/prelabel-runs", response_model=list[PrelabelRun])
def list_prelabel_runs(slug: str):
    return prelabels.list_runs(slug)


@router.post("/projects/{slug}/prelabel-runs", response_model=PrelabelRun, responses=_CONFLICT)
def create_prelabel_run(slug: str, req: PrelabelRunCreate):
    return prelabels.run(slug, req.threshold)


@router.post("/projects/{slug}/annotations/sync", response_model=AnnotationSyncResult, responses=_CONFLICT)
def sync_annotations(slug: str):
    return annotations.sync(slug)


@router.get("/projects/{slug}/verification", response_model=VerificationReport)
def get_verification(slug: str):
    return verification.report(slug)
