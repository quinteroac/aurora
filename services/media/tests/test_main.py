from __future__ import annotations

import io
import json
import os
import socket
import subprocess
import time
import tomllib
import urllib.request
from pathlib import Path

import pytest

import main

MEDIA_DIR = Path(__file__).resolve().parents[1]
PYPROJECT_PATH = MEDIA_DIR / "pyproject.toml"
PACKAGE_JSON_PATH = MEDIA_DIR / "package.json"


@pytest.fixture(autouse=True)
def reset_comfy_diffusion_state() -> None:
    main.comfy_diffusion_import_error = None


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
        assert payload == {"status": "ok", "service": "media"}
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
    assert main.resolve_port(None) == 8000
    assert main.resolve_port("8123") == 8123


def test_us_004_ac06_ruff_check_passes() -> None:
    result = subprocess.run(
        ["uv", "run", "ruff", "check", "."],
        cwd=MEDIA_DIR,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr


def test_us_005_ac01_startup_imports_comfy_diffusion_module_name() -> None:
    imported_modules: list[str] = []

    def fake_import(module_name: str) -> object:
        imported_modules.append(module_name)
        return object()

    error = main.run_comfy_diffusion_smoke_test(importer=fake_import)

    assert error is None
    assert imported_modules == ["comfy_diffusion"]


def test_us_005_ac02_health_is_degraded_when_import_fails(monkeypatch) -> None:
    def fail_import(_: str) -> object:
        raise ImportError("No module named 'comfy_diffusion'")

    monkeypatch.setattr(main.importlib, "import_module", fail_import)

    main.startup()

    assert main.health() == {
        "status": "degraded",
        "error": "No module named 'comfy_diffusion'",
    }


def test_us_005_ac03_startup_logs_import_result_to_stdout(monkeypatch) -> None:
    def fake_import(_: str) -> object:
        return object()

    monkeypatch.setattr(main.importlib, "import_module", fake_import)

    stream_handler = next(
        handler
        for handler in main.logger.handlers
        if isinstance(handler, main.logging.StreamHandler)
    )

    test_stream = io.StringIO()
    original_stream = stream_handler.setStream(test_stream)
    try:
        main.startup()
    finally:
        stream_handler.setStream(original_stream)

    assert "comfy_diffusion import smoke test passed" in test_stream.getvalue()
