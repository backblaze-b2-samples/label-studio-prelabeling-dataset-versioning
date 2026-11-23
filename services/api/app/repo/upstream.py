"""Shared error type for the HTTP services this API orchestrates.

Label Studio and the ML backend are separate processes (docker compose). When
one of them is down or answers with an error, the repo adapters raise this, so
the service layer can map it to a 502/503 without knowing anything about httpx.
"""


class UpstreamServiceError(RuntimeError):
    def __init__(self, service: str, message: str, status_code: int | None = None):
        self.service = service
        self.status_code = status_code
        super().__init__(f"{service}: {message}")

    @property
    def unreachable(self) -> bool:
        """True when the service never answered (connection refused, timeout)."""
        return self.status_code is None
