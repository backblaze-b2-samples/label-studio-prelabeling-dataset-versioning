"""Label Studio ML backend protocol, implemented without the label-studio-ml SDK.

Routes: GET /health, POST /setup, POST /predict (the protocol), plus GET /info
(model id, revision, license, device, label names) for the sample's API.
"""

import io
import json
import logging
import sys
import threading
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel, Field

from app import b2
from app.config import MODEL_ID, MODEL_LICENSE, MODEL_NAME, MODEL_REVISION, MODEL_SOURCE_URL, settings
from app.labelstudio import parse_label_config, to_result
from app.model import get_detector

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(message)s")
logger = logging.getLogger("ml-backend")
MODEL_VERSION = f"{MODEL_ID}@{MODEL_REVISION[:7]}"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    detector = get_detector()
    if settings.preload_model and hasattr(detector, "load"):
        # Warm the weights off the request path so the first run doesn't wait.
        threading.Thread(target=detector.load, name="preload-model", daemon=True).start()
    yield


app = FastAPI(title="Label Studio ML backend (RT-DETR R18)", lifespan=lifespan)


class PredictRequest(BaseModel):
    tasks: list[dict[str, Any]]
    label_config: str | None = None
    project: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)


@app.get("/health")
def health():
    detector = get_detector()
    return {"status": "UP", "model_class": "RTDetrForObjectDetection", "model_loaded": detector.loaded}


@app.post("/setup")
def setup(body: dict[str, Any] | None = None):
    if body and body.get("schema"):
        try:
            parse_label_config(body["schema"])
        except (ValueError, SyntaxError) as e:
            raise HTTPException(status_code=400, detail=f"unsupported label config: {e}") from None
    return {"model_version": MODEL_VERSION}


@app.get("/info")
def info():
    detector = get_detector()
    return {
        "id": MODEL_ID,
        "name": MODEL_NAME,
        "license": MODEL_LICENSE,
        "source_url": MODEL_SOURCE_URL,
        "revision": MODEL_REVISION,
        "device": detector.device,
        "labels": detector.labels(),
    }


@app.post("/predict")
def predict(request: PredictRequest):
    if not request.label_config:
        raise HTTPException(status_code=400, detail="label_config is required")
    try:
        config = parse_label_config(request.label_config)
    except (ValueError, SyntaxError) as e:
        raise HTTPException(status_code=400, detail=f"unsupported label config: {e}") from None
    threshold = float(request.params.get("threshold") or settings.default_threshold)
    images: list[Image.Image] = []
    for task in request.tasks:
        uri = (task.get("data") or {}).get(config.to_name) or (task.get("data") or {}).get("image")
        try:
            raw = b2.read_image_bytes(uri)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"task {task.get('id')}: {e}") from None
        images.append(Image.open(io.BytesIO(raw)).convert("RGB"))
    detections = get_detector().detect(images, threshold) if images else []
    results = []
    for image, boxes in zip(images, detections, strict=True):
        result = to_result(boxes, image.width, image.height, config)
        scores = [r["score"] for r in result]
        results.append(
            {
                "result": result,
                "score": round(sum(scores) / len(scores), 4) if scores else 0.0,
                "model_version": MODEL_VERSION,
                "image_width": image.width,
                "image_height": image.height,
            }
        )
    logger.info(json.dumps({"event": "predict", "tasks": len(results), "threshold": threshold}))
    return {"results": results, "model_version": MODEL_VERSION}
