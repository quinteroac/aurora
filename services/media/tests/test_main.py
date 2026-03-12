from __future__ import annotations

import json
import os
import socket
import subprocess
import time
import tomllib
import urllib.request
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app

MEDIA_DIR = Path(__file__).resolve().parents[1]
PYPROJECT_PATH = MEDIA_DIR / "pyproject.toml"
PACKAGE_JSON_PATH = MEDIA_DIR / "package.json"


def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_health(port: int, timeout_seconds: float = 15.0) -> dict[str, str]:
    deadline = time.time() + timeout_seconds
    url = f"http://127.0.0.1:{port}/health"

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url) as response:  # nosec: B310
                if response.status == 200:
                    return json.loads(response.read().decode("utf-8"))
        except Exception:
            time.sleep(0.1)

    raise AssertionError(f"Timed out waiting for {url}")


def test_us_004_ac01_pyproject_declares_required_dependencies() -> None:
    pyproject = tomllib.loads(PYPROJECT_PATH.read_text(encoding="utf-8"))
    dependencies: list[str] = pyproject["project"]["dependencies"]

    assert any(dep.startswith("fastapi") for dep in dependencies)
    assert any(dep.startswith("uvicorn") for dep in dependencies)
    assert any(dep.startswith("comfy-diffusion") for dep in dependencies)


def test_us_004_ac02_uv_sync_installs_dependencies_without_errors() -> None:
    result = subprocess.run(
        ["uv", "sync"],
        cwd=MEDIA_DIR,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_us_004_ac03_health_returns_expected_payload() -> None:
    port = get_free_port()
    process = subprocess.Popen(
        ["uv", "run", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=MEDIA_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        payload = wait_for_health(port)
        assert payload == {"status": "ok", "service": "media", "pipeline": "ready"}
    finally:
        process.terminate()
        process.wait(timeout=10)


def test_us_004_ac04_service_starts_with_equivalent_uv_command() -> None:
    package_json = json.loads(PACKAGE_JSON_PATH.read_text(encoding="utf-8"))
    dev_script = package_json.get("scripts", {}).get("dev", "")

    assert "uv run python main.py" in dev_script

    port = get_free_port()
    process = subprocess.Popen(
        ["uv", "run", "python", "main.py"],
        cwd=MEDIA_DIR,
        env={**os.environ, "PORT": str(port)},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        payload = wait_for_health(port)
        assert payload["status"] == "ok"
    finally:
        process.terminate()
        process.wait(timeout=10)


def test_us_004_ac05_default_port_is_8000_and_port_is_configurable() -> None:
    from config import resolve_port
    assert resolve_port(None) == 8000
    assert resolve_port("8123") == 8123


def test_us_004_ac06_ruff_check_passes() -> None:
    result = subprocess.run(
        ["uv", "run", "ruff", "check", "."],
        cwd=MEDIA_DIR,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr


def test_us_005_ac01_startup_uses_check_runtime_and_sets_pipeline_when_ok() -> None:
    with patch("comfy_diffusion.check_runtime", return_value={"status": "ok"}):
        with TestClient(app, raise_server_exceptions=True) as client:
            resp = client.get("/health")
    assert resp.json() == {"status": "ok", "service": "media", "pipeline": "ready"}
    assert app.state.pipeline is not None
    assert app.state.pipeline_status == "ready"


def test_us_005_ac02_health_is_degraded_when_check_runtime_fails() -> None:
    with patch(
        "comfy_diffusion.check_runtime",
        return_value={"error": "ComfyUI vendor not found", "comfyui_version": None},
    ):
        with TestClient(app, raise_server_exceptions=True) as client:
            resp = client.get("/health")
    assert resp.json() == {
        "status": "degraded",
        "service": "media",
        "pipeline": "unavailable",
        "error": "{'error': 'ComfyUI vendor not found', 'comfyui_version': None}",
    }
    assert app.state.pipeline is None
    assert app.state.pipeline_status == "degraded"


def test_us_005_ac03_startup_calls_check_runtime_before_creating_pipeline() -> None:
    with patch("comfy_diffusion.check_runtime") as mock_check:
        mock_check.return_value = {"status": "ok"}
        with TestClient(app, raise_server_exceptions=True) as client:
            client.get("/health")
    mock_check.assert_called_once()
