from __future__ import annotations

import base64
import json
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from fastapi.testclient import TestClient

from jobs.store import store as job_store
from pipelines.image import DEFAULT_PNG_BYTES

MEDIA_DIR = Path(__file__).resolve().parents[1]
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


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


# ---------------------------------------------------------------------------
# AC01 — GET /jobs/{job_id} returns 200 with expected body shape
# ---------------------------------------------------------------------------

def test_us_002_ac01_get_job_returns_200_with_expected_body_shape(
    client: TestClient,
) -> None:
    submit = client.post("/generate/image", json={"prompt": "A lighthouse on a cliff"})
    assert submit.status_code == 202
    job_id = submit.json()["job_id"]

    resp = client.get(f"/jobs/{job_id}")
    assert resp.status_code == 200
    payload = resp.json()
    assert set(payload.keys()) == {"status", "result", "error"}
    assert payload["status"] in {"pending", "running", "done", "failed"}


def test_us_002_ac01_returns_expected_result_for_done_and_failed_states(
    client: TestClient,
) -> None:
    image_b64 = base64.b64encode(DEFAULT_PNG_BYTES).decode("ascii")
    job_store.create("done-job", {"status": "done", "result": {"image_b64": image_b64}})
    job_store.create("failed-job", {"status": "failed", "error": "pipeline_timeout"})

    done = client.get("/jobs/done-job").json()
    failed = client.get("/jobs/failed-job").json()

    assert done == {"status": "done", "result": {"image_b64": image_b64}, "error": None}
    assert failed == {"status": "failed", "result": None, "error": "pipeline_timeout"}


# ---------------------------------------------------------------------------
# AC02 — Unknown job_id returns 404 { "detail": "Job not found" }
# ---------------------------------------------------------------------------

def test_us_002_ac02_unknown_job_returns_404_with_expected_detail(
    client: TestClient,
) -> None:
    resp = client.get("/jobs/missing-job-id")
    assert resp.status_code == 404
    assert resp.json() == {"detail": "Job not found"}


# ---------------------------------------------------------------------------
# AC03 — image_b64 is a valid base64-encoded PNG
# ---------------------------------------------------------------------------

def test_us_002_ac03_image_b64_is_valid_base64_png(client: TestClient) -> None:
    submit = client.post("/generate/image", json={"prompt": "Crystal forest"})
    assert submit.status_code == 202
    job_id = submit.json()["job_id"]

    resp = client.get(f"/jobs/{job_id}")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["status"] == "done"

    encoded: str = payload["result"]["image_b64"]
    decoded = base64.b64decode(encoded, validate=True)
    assert decoded.startswith(PNG_SIGNATURE)


# ---------------------------------------------------------------------------
# AC04 — Lint / typecheck passes
# ---------------------------------------------------------------------------

def test_us_002_ac04_typecheck_lint_passes() -> None:
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
# Integration — real server round-trip
# ---------------------------------------------------------------------------

def test_us_002_integration_poll_after_submit() -> None:
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

        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/generate/image",
            data=json.dumps({"prompt": "Crystal forest"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req) as r:  # nosec: B310
            job_id = json.loads(r.read().decode("utf-8"))["job_id"]

        req2 = urllib.request.Request(
            f"http://127.0.0.1:{port}/jobs/{job_id}",
            method="GET",
        )
        with urllib.request.urlopen(req2) as r2:  # nosec: B310
            payload = json.loads(r2.read().decode("utf-8"))

        assert r2.status == 200
        assert set(payload.keys()) == {"status", "result", "error"}
    finally:
        process.terminate()
        process.wait(timeout=10)
