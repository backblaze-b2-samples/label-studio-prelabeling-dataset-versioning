from fastapi import APIRouter

from app.service.health import get_health
from app.types import HealthStatus

router = APIRouter()


# Sync `def` so the blocking B2 / Label Studio / ML probes run in Starlette's
# threadpool rather than on the event loop (see runtime/files.py rationale).
@router.get("/health", response_model=HealthStatus)
def health():
    return get_health()
