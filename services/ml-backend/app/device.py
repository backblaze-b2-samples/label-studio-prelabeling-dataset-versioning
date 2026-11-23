"""Runtime device selection: CUDA, then Apple MPS, then CPU.

Nothing requires a GPU. In the Linux container MPS never exists, so there it
is CUDA then CPU; running the backend natively on a Mac picks MPS.
"""

from typing import Any


def select_device(torch_module: Any, override: str = "") -> str:
    if override in ("cuda", "mps", "cpu"):
        return override
    cuda = getattr(torch_module, "cuda", None)
    if cuda is not None and cuda.is_available():
        return "cuda"
    mps = getattr(getattr(torch_module, "backends", None), "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return "cpu"
