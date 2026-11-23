# ML backend for Label Studio: RT-DETR R18 on CPU by default (CUDA if present).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/home/app/.cache/huggingface \
    PIP_NO_CACHE_DIR=1

# Pre-create the model cache so the named volume inherits app ownership.
RUN useradd --create-home --uid 10001 app \
 && mkdir -p /home/app/.cache/huggingface && chown -R app:app /home/app/.cache
WORKDIR /srv

COPY requirements.txt .
# CPU-only torch wheel first (no CUDA libraries in the image), then the rest.
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.15.0 \
 && pip install -r requirements.txt

COPY app ./app
USER app
EXPOSE 9090
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=10 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:9090/health', timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9090"]
