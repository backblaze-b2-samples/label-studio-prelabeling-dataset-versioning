from app.types.base import ResponseModel


class UploadStats(ResponseModel):
    """Aggregate bucket figures behind the file browser and command palette."""

    total_files: int
    total_size_bytes: int
    total_size_human: str
    uploads_today: int
    total_downloads: int
