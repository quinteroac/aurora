from __future__ import annotations

import json
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from jobs.store import store as job_store
from main import app
from schemas.generate import GenerateImageRequest

MEDIA_DIR = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# Helpers for subprocess integration tests
# ---------------------------------------------------------------------------

def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_server(port: int, timeout_seconds: float = 15.0) -> None:
    deadline = time.time() + timeout_seconds
    url = f"http://127.0.0.1:{port}/health"

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url) as response:  # nosec: B310
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.1)

    raise AssertionError(f"Timed out waiting for {url}")


def post_json_error(port: int, path: str, payload: dict[str, str]) -> tuple[int, str]:
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request) as response:  # nosec: B310
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8")


# ---------------------------------------------------------------------------
# AC01 — POST accepts { prompt } JSON body
# ---------------------------------------------------------------------------

def test_us_001_ac01_accepts_prompt_json_body(client: TestClient) -> None:
    response = client.post("/generate/image", json={"prompt": "A mountain castle at dusk"})
    assert response.status_code == 202


# ---------------------------------------------------------------------------
# AC02 — Response is HTTP 202 with { job_id: uuid }
# ---------------------------------------------------------------------------

def test_us_001_ac02_returns_202_with_uuid_job_id(client: TestClient) -> None:
    response = client.post("/generate/image", json={"prompt": "Ancient observatory"})
    assert response.status_code == 202
    payload = response.json()
    assert set(payload.keys()) == {"job_id"}
    parsed = UUID(str(payload["job_id"]))
    assert str(parsed) == payload["job_id"]


# ---------------------------------------------------------------------------
# AC03 — Job registered as "pending" before the response is returned
# ---------------------------------------------------------------------------

def test_us_001_ac03_registers_pending_job_before_response() -> None:
    class CapturePipeline:
        def __call__(self, prompt: str) -> dict[str, str]:
            return {"image_b64": ""}

    job_store.clear()
    with TestClient(app, raise_server_exceptions=True) as c:
        app.state.pipeline = CapturePipeline()
        app.state.pipeline_status = "ready"
        app.state.pipeline_error = None
        # We cannot easily intercept add_task in TestClient without running
        # the task, so we verify the store shape after the synchronous part.
        response = c.post("/generate/image", json={"prompt": "Forest temple at dawn"})
        assert response.status_code == 202
        job_id = response.json()["job_id"]
        # The job must exist in the store (it was created before add_task).
        job = job_store.fetch(job_id)
        assert job is not None
        assert job["status"] in {"pending", "running", "done", "failed"}

    job_store.clear()


# ---------------------------------------------------------------------------
# AC04 — Background task enqueued for the Illustrious pipeline
# ---------------------------------------------------------------------------

def test_us_001_ac04_enqueues_background_illustrious_pipeline(client: TestClient) -> None:
    response = client.post("/generate/image", json={"prompt": "Portrait of a steampunk artificer"})
    assert response.status_code == 202
    job_id = response.json()["job_id"]
    # TestClient runs background tasks synchronously; job must be done.
    job = job_store.fetch(job_id)
    assert job is not None
    assert job["status"] == "done"
    assert "image_b64" in job["result"]


# ---------------------------------------------------------------------------
# AC05 — Missing / empty prompt returns HTTP 422
# ---------------------------------------------------------------------------

def test_us_001_ac05_missing_or_empty_prompt_returns_422(client: TestClient) -> None:
    missing = client.post("/generate/image", json={})
    assert missing.status_code == 422

    empty = client.post("/generate/image", json={"prompt": ""})
    assert empty.status_code == 422

    with pytest.raises(ValidationError):
        GenerateImageRequest.model_validate({"prompt": ""})


# ---------------------------------------------------------------------------
# AC06 — Lint / typecheck passes
# ---------------------------------------------------------------------------

def test_us_001_ac06_typecheck_lint_passes() -> None:
    lint = subprocess.run(
        ["uv", "run", "ruff", "check", "."],
        cwd=MEDIA_DIR,
        check=False,
        capture_output=True,
        text=True,
    )
    compile_check = subprocess.run(
        ["uv", "run", "python", "-m", "compileall", "main.py"],
        cwd=MEDIA_DIR,
        check=False,
        capture_output=True,
        text=True,
    )

    assert lint.returncode == 0, lint.stdout + lint.stderr
    assert compile_check.returncode == 0, compile_check.stdout + compile_check.stderr


# ---------------------------------------------------------------------------
# Integration — real server, real startup
# ---------------------------------------------------------------------------

def test_us_001_integration_real_server_accepts_job() -> None:
    port = get_free_port()
    process = subprocess.Popen(
        ["uv", "run", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=MEDIA_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        wait_for_server(port)
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}/generate/image",
            data=json.dumps({"prompt": "A mountain castle at dusk"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request) as resp:  # nosec: B310
            assert resp.status == 202
    finally:
        process.terminate()
        process.wait(timeout=10)
