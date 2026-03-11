from __future__ import annotations

import base64
import json
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

import main

MEDIA_DIR = Path(__file__).resolve().parents[1]
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@pytest.fixture(autouse=True)
def reset_image_jobs() -> None:
    main.image_jobs.clear()


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


def post_json(port: int, path: str, payload: dict[str, str]) -> tuple[int, dict[str, object]]:
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request) as response:  # nosec: B310
        return response.status, json.loads(response.read().decode("utf-8"))


def get_json(port: int, path: str) -> tuple[int, dict[str, object]]:
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        method="GET",
    )

    with urllib.request.urlopen(request) as response:  # nosec: B310
        return response.status, json.loads(response.read().decode("utf-8"))


def get_json_error(port: int, path: str) -> tuple[int, dict[str, object]]:
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        method="GET",
    )

    try:
        with urllib.request.urlopen(request) as response:  # nosec: B310
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


def test_us_002_ac01_get_job_returns_200_with_expected_body_shape() -> None:
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
        submit_status, submit_payload = post_json(
            port,
            "/generate/image",
            {"prompt": "A lighthouse on a cliff at sunrise"},
        )
        assert submit_status == 202

        job_status, job_payload = get_json(port, f"/jobs/{submit_payload['job_id']}")
        assert job_status == 200
        assert set(job_payload.keys()) == {"status", "result", "error"}
        assert job_payload["status"] in {"pending", "running", "done", "failed"}

        if job_payload["status"] in {"pending", "running"}:
            assert job_payload["result"] is None
            assert job_payload["error"] is None
        elif job_payload["status"] == "done":
            result = job_payload["result"]
            assert isinstance(result, dict)
            assert isinstance(result.get("image_b64"), str)
            assert job_payload["error"] is None
        else:
            assert job_payload["result"] is None
            assert isinstance(job_payload["error"], str)
    finally:
        process.terminate()
        process.wait(timeout=10)


def test_us_002_ac01_returns_expected_result_for_done_and_failed_states() -> None:
    image_b64 = base64.b64encode(main.DEFAULT_PNG_BYTES).decode("ascii")
    main.image_jobs["done-job"] = {"status": "done", "result": {"image_b64": image_b64}}
    main.image_jobs["failed-job"] = {"status": "failed", "error": "pipeline_timeout"}

    done_response = main.get_job_status("done-job")
    failed_response = main.get_job_status("failed-job")

    assert done_response.model_dump() == {
        "status": "done",
        "result": {"image_b64": image_b64},
        "error": None,
    }
    assert failed_response.model_dump() == {
        "status": "failed",
        "result": None,
        "error": "pipeline_timeout",
    }


def test_us_002_ac02_unknown_job_returns_404_with_expected_detail() -> None:
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
        status_code, payload = get_json_error(port, "/jobs/missing-job-id")
        assert status_code == 404
        assert payload == {"detail": "Job not found"}
    finally:
        process.terminate()
        process.wait(timeout=10)


def test_us_002_ac03_image_b64_is_valid_base64_png(monkeypatch) -> None:
    image_b64 = base64.b64encode(main.DEFAULT_PNG_BYTES).decode("ascii")

    def fake_pipeline(_: str) -> dict[str, str]:
        return {"image_b64": image_b64}

    main.image_jobs["job-123"] = {"status": "pending", "prompt": "Crystal forest"}
    monkeypatch.setattr(main, "run_comfy_diffusion_illustrious_pipeline", fake_pipeline)

    main.process_image_job("job-123", "Crystal forest")
    payload = main.get_job_status("job-123").model_dump()

    assert payload["status"] == "done"
    encoded = payload["result"]["image_b64"]
    decoded = base64.b64decode(encoded, validate=True)
    assert decoded.startswith(PNG_SIGNATURE)


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
