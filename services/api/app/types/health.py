from pydantic import Field

from app.types.base import ResponseModel


class ServiceStatus(ResponseModel):
    """Reachability of one companion service (Label Studio or the ML backend)."""

    ok: bool = Field(description="True when the service answered its health probe.")
    url: str = Field(description="Base URL this API uses to reach the service.")
    version: str | None = Field(
        default=None, description="Reported version (Label Studio release, or model id)."
    )
    device: str | None = Field(
        default=None, description="ML backend only: the torch device the model runs on."
    )
    detail: str | None = Field(
        default=None, description="Why the probe failed, when it failed."
    )


class HealthStatus(ResponseModel):
    """Liveness plus B2, Label Studio and ML backend reachability.

    The route answers HTTP 200 even when a dependency is unreachable, so a
    caller must read the per-service fields rather than trusting the status code.
    """

    status: str = Field(
        description='"healthy" when B2, Label Studio and the ML backend all answered, else "degraded".'
    )
    b2_connected: bool = Field(
        description="True when the bucket answered a cheap head request."
    )
    label_studio: ServiceStatus
    ml_backend: ServiceStatus
