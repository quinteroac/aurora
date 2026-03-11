from __future__ import annotations

import base64
from collections.abc import Callable, Generator

import pytest
from fastapi.testclient import TestClient

from jobs.store import store as job_store
from main import app
from pipelines.image import DEFAULT_PNG_BYTES

_DEFAULT_B64 = base64.b64encode(DEFAULT_PNG_BYTES).decode("ascii")


class MockPipeline:
    """Synchronous drop-in for IllustriousPipeline that returns a static PNG."""

    def __call__(self, prompt: str) -> dict[str, str]:
        return {"image_b64": _DEFAULT_B64}


class FailingPipeline:
    """Pipeline that always raises to test error handling."""

    def __init__(self, message: str = "pipeline exploded") -> None:
        self._message = message

    def __call__(self, prompt: str) -> dict[str, str]:
        raise RuntimeError(self._message)


class SlowPipeline:
    """Pipeline that sleeps longer than any test timeout to exercise timeout handling."""

    def __init__(self, sleep_seconds: float = 0.5) -> None:
        import time

        self._sleep = sleep_seconds
        self._time = time

    def __call__(self, prompt: str) -> dict[str, str]:
        self._time.sleep(self._sleep)
        return {"image_b64": _DEFAULT_B64}


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    """TestClient with a MockPipeline on app.state — no monkeypatching of imports."""
    job_store.clear()
    with TestClient(app, raise_server_exceptions=True) as c:
        # Override pipeline state AFTER lifespan runs to inject the mock.
        app.state.pipeline = MockPipeline()
        app.state.pipeline_status = "ready"
        app.state.pipeline_error = None
        yield c
    job_store.clear()


@pytest.fixture()
def degraded_client() -> Generator[TestClient, None, None]:
    """TestClient simulating a failed pipeline load."""
    job_store.clear()
    with TestClient(app, raise_server_exceptions=True) as c:
        app.state.pipeline = None
        app.state.pipeline_status = "unavailable"
        app.state.pipeline_error = "No module named 'comfy_diffusion'"
        yield c
    job_store.clear()


@pytest.fixture()
def loading_client() -> Generator[TestClient, None, None]:
    """TestClient simulating pipeline still initialising."""
    job_store.clear()
    with TestClient(app, raise_server_exceptions=True) as c:
        app.state.pipeline = None
        app.state.pipeline_status = "loading"
        app.state.pipeline_error = None
        yield c
    job_store.clear()


@pytest.fixture()
def failing_client() -> Generator[TestClient, None, None]:
    """TestClient whose pipeline always raises RuntimeError."""
    job_store.clear()
    with TestClient(app, raise_server_exceptions=False) as c:
        app.state.pipeline = FailingPipeline()
        app.state.pipeline_status = "ready"
        app.state.pipeline_error = None
        yield c
    job_store.clear()


@pytest.fixture()
def mock_pipeline_factory() -> Callable[..., MockPipeline]:
    return MockPipeline
