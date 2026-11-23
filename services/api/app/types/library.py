from datetime import datetime
from typing import Literal

from pydantic import Field

from app.types.base import ResponseModel

AssetKind = Literal["raw", "prelabels", "annotations", "exports"]


class AssetItem(ResponseModel):
    key: str
    size_bytes: int
    last_modified: datetime
    group: str | None = Field(description="Run id for pre-labels, release name for exports.")
    prelabel_status: bool | None = Field(
        default=None, description="Raw images only: has a pre-label in the latest run."
    )
    annotation_status: bool | None = Field(
        default=None, description="Raw images only: its task has at least one annotation."
    )


class AssetPage(ResponseModel):
    project: str
    kind: AssetKind
    prefix: str
    items: list[AssetItem]
    groups: list[str] = Field(description="Run ids or release names present on this page.")
    next_cursor: str | None
