"""ML backend settings, read from the environment (docker compose passes them)."""

import os
from dataclasses import dataclass, field

# Pinned so a pre-label run is reproducible: the revision is recorded in every
# pre-label record and in every release manifest. Apache-2.0 (model card).
MODEL_ID = "PekingU/rtdetr_r18vd_coco_o365"
MODEL_REVISION = "386c43855d01bcd966e548f3296fbd2cd2a2a40b"
MODEL_NAME = "RT-DETR R18 (COCO, Objects365-pretrained)"
MODEL_LICENSE = "Apache-2.0"
MODEL_SOURCE_URL = f"https://huggingface.co/{MODEL_ID}"


def _flag(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    b2_application_key_id: str = field(default_factory=lambda: os.environ.get("B2_APPLICATION_KEY_ID", ""))
    b2_application_key: str = field(default_factory=lambda: os.environ.get("B2_APPLICATION_KEY", ""))
    b2_bucket_name: str = field(default_factory=lambda: os.environ.get("B2_BUCKET_NAME", ""))
    b2_region: str = field(default_factory=lambda: os.environ.get("B2_REGION", ""))
    default_threshold: float = field(default_factory=lambda: float(os.environ.get("DEFAULT_THRESHOLD", "0.5")))
    preload_model: bool = field(default_factory=lambda: _flag("PRELOAD_MODEL", True))
    # Optional override of the auto-detected device: "cuda", "mps" or "cpu".
    torch_device: str = field(default_factory=lambda: os.environ.get("TORCH_DEVICE", "").strip().lower())

    @property
    def endpoint_url(self) -> str:
        """Always derived from the region; there is no endpoint variable."""
        return f"https://s3.{self.b2_region}.backblazeb2.com"


settings = Settings()
