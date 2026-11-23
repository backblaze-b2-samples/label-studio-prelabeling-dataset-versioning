"""The local detector: RT-DETR R18 through Hugging Face transformers.

Heavy imports (torch, transformers) happen inside `load()`, so the HTTP app and
its unit tests import without the ML stack.
"""

import logging
import threading
from typing import Protocol

from PIL import Image

from app.config import MODEL_ID, MODEL_REVISION, settings
from app.device import select_device

logger = logging.getLogger(__name__)


class Detector(Protocol):
    device: str

    def labels(self) -> list[str]: ...

    def detect(self, images: list[Image.Image], threshold: float) -> list[list[tuple]]: ...

    @property
    def loaded(self) -> bool: ...


class RTDetrDetector:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._model = None
        self._processor = None
        self._labels: list[str] | None = None
        self.device = "unloaded"

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        with self._lock:
            if self._model is not None:
                return
            import torch
            from transformers import AutoImageProcessor, AutoModelForObjectDetection

            self.device = select_device(torch, settings.torch_device)
            logger.info("Loading %s@%s on %s", MODEL_ID, MODEL_REVISION[:7], self.device)
            self._processor = AutoImageProcessor.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
            model = AutoModelForObjectDetection.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
            self._model = model.to(self.device).eval()
            mapping = model.config.id2label
            self._labels = [mapping[i] for i in sorted(mapping)]

    def labels(self) -> list[str]:
        if self._labels is None and self._model is None:
            # Label names come from the config alone; no weights needed.
            from transformers import AutoConfig

            mapping = AutoConfig.from_pretrained(MODEL_ID, revision=MODEL_REVISION).id2label
            return [mapping[i] for i in sorted(mapping)]
        return list(self._labels or [])

    def detect(self, images: list[Image.Image], threshold: float) -> list[list[tuple]]:
        self.load()
        import torch

        inputs = self._processor(images=images, return_tensors="pt").to(self.device)
        with torch.no_grad():
            outputs = self._model(**inputs)
        sizes = [(img.height, img.width) for img in images]
        decoded = self._processor.post_process_object_detection(
            outputs, target_sizes=sizes, threshold=threshold
        )
        mapping = self._model.config.id2label
        results = []
        for item in decoded:
            boxes = []
            for score, label, box in zip(item["scores"], item["labels"], item["boxes"], strict=True):
                x0, y0, x1, y1 = (float(v) for v in box.tolist())
                boxes.append((mapping[int(label)], float(score), x0, y0, x1, y1))
            results.append(boxes)
        return results


_detector: Detector = RTDetrDetector()


def get_detector() -> Detector:
    return _detector


def set_detector(detector: Detector) -> None:
    """Tests swap in a stub; production keeps the RT-DETR detector."""
    global _detector
    _detector = detector
