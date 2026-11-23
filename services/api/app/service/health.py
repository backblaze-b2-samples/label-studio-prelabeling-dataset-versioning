"""Aggregate health: B2, Label Studio and the ML backend, each probed cheaply."""

from app.config import settings
from app.repo import check_connectivity
from app.repo.label_studio import probe_label_studio
from app.repo.ml_backend import probe_ml_backend
from app.types import HealthStatus, ServiceStatus


def label_studio_status() -> ServiceStatus:
    ok, version, detail = probe_label_studio()
    return ServiceStatus(ok=ok, url=settings.label_studio_url, version=version, detail=detail)


def ml_backend_status() -> ServiceStatus:
    ok, info, detail = probe_ml_backend()
    return ServiceStatus(
        ok=ok,
        url=settings.ml_backend_url,
        version=info.get("id") if info else None,
        device=info.get("device") if info else None,
        detail=detail,
    )


def get_health() -> HealthStatus:
    b2_ok = check_connectivity()
    ls = label_studio_status()
    ml = ml_backend_status()
    return HealthStatus(
        status="healthy" if (b2_ok and ls.ok and ml.ok) else "degraded",
        b2_connected=b2_ok,
        label_studio=ls,
        ml_backend=ml,
    )
