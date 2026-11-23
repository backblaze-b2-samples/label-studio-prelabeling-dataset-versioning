"""Device selection order: CUDA, then MPS, then CPU — never a hard GPU requirement."""

from types import SimpleNamespace

from app.device import select_device


def fake_torch(cuda: bool, mps: bool | None):
    backends = SimpleNamespace(mps=SimpleNamespace(is_available=lambda: mps)) if mps is not None else SimpleNamespace()
    return SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: cuda), backends=backends)


def test_cuda_first():
    assert select_device(fake_torch(cuda=True, mps=True)) == "cuda"


def test_mps_when_no_cuda():
    assert select_device(fake_torch(cuda=False, mps=True)) == "mps"


def test_cpu_default():
    assert select_device(fake_torch(cuda=False, mps=False)) == "cpu"


def test_cpu_when_library_has_no_mps():
    assert select_device(fake_torch(cuda=False, mps=None)) == "cpu"


def test_override_wins():
    assert select_device(fake_torch(cuda=True, mps=True), override="cpu") == "cpu"
