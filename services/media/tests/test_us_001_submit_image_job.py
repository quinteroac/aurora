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
from pydantic import ValidationError

import main

MEDIA_DIR = Path(__file__).resolve().parents[1]


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


def test_us_001_ac01_accepts_prompt_json_body() -> None:
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
        status_code, _ = post_json(port, "/generate/image", {"prompt": "A mountain castle at dusk"})
        assert status_code == 202
    finally:
        process.terminate()
        process.wait(timeout=10)


def test_us_001_ac02_returns_202_with_uuid_job_id() -> None:
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
        status_code, payload = post_json(port, "/generate/image", {"prompt": "Ancient observatory"})
        assert status_code == 202
        assert set(payload.keys()) == {"job_id"}
        parsed_job_id = UUID(str(payload["job_id"]))
        assert str(parsed_job_id) == payload["job_id"]
    finally:
        process.terminate()
        process.wait(timeout=10)


def test_us_001_ac03_registers_pending_job_before_response(monkeypatch) -> None:
    observed_pending_status: list[str] = []

    def fake_add_task(_: object, __: object, job_id: str, ___: str) -> None:
        observed_pending_status.append(main.image_jobs[job_id]["status"])

    monkeypatch.setattr(main.BackgroundTasks, "add_task", fake_add_task)

    request = main.GenerateImageRequest.model_validate({"prompt": "Forest temple at dawn"})
    response = main.generate_image(request=request, background_tasks=main.BackgroundTasks())

    assert response.job_id in main.image_jobs
    assert observed_pending_status == ["pending"]


def test_us_001_ac04_enqueues_background_illustrious_pipeline(monkeypatch) -> None:
    enqueued_function_name: list[str] = []
    enqueued_prompt: list[str] = []
    pipeline_calls: list[str] = []

    def fake_add_task(_: object, function: object, job_id: str, prompt: str) -> None:
        enqueued_function_name.append(getattr(function, "__name__", ""))
        enqueued_prompt.append(prompt)
        function(job_id, prompt)

    def fake_pipeline_runner(prompt: str) -> dict[str, str]:
        pipeline_calls.append(prompt)
        return {"pipeline": "illustrious", "prompt": prompt}

    monkeypatch.setattr(main.BackgroundTasks, "add_task", fake_add_task)
    monkeypatch.setattr(
        main,
        "run_comfy_diffusion_illustrious_pipeline",
        fake_pipeline_runner,
    )

    prompt = "Portrait of a steampunk artificer"
    request = main.GenerateImageRequest.model_validate({"prompt": prompt})
    response = main.generate_image(request=request, background_tasks=main.BackgroundTasks())

    assert response.job_id in main.image_jobs
    assert enqueued_function_name == ["process_image_job"]
    assert enqueued_prompt == [prompt]
    assert pipeline_calls == [prompt]


def test_us_001_ac05_missing_or_empty_prompt_returns_422() -> None:
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

        missing_request = urllib.request.Request(
            f"http://127.0.0.1:{port}/generate/image",
            data=json.dumps({}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with pytest.raises(urllib.error.HTTPError) as missing_error:
            urllib.request.urlopen(missing_request)  # nosec: B310

        empty_status, _ = post_json_error(port, "/generate/image", {"prompt": ""})

        assert missing_error.value.code == 422
        assert empty_status == 422

        with pytest.raises(ValidationError):
            main.GenerateImageRequest.model_validate({"prompt": ""})
    finally:
        process.terminate()
        process.wait(timeout=10)


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
