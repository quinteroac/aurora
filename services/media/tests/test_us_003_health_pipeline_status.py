from __future__ import annotations

import subprocess
from pathlib import Path

import main

MEDIA_DIR = Path(__file__).resolve().parents[1]


def test_us_003_ac01_health_reports_ready_when_pipeline_loaded() -> None:
    main.comfy_diffusion_import_error = None
    main.comfy_diffusion_pipeline_status = "ready"

    assert main.health() == {
        "status": "ok",
        "service": "media",
        "pipeline": "ready",
    }


def test_us_003_ac02_health_reports_degraded_when_pipeline_load_fails() -> None:
    main.comfy_diffusion_import_error = "No module named 'comfy_diffusion'"
    main.comfy_diffusion_pipeline_status = "unavailable"

    assert main.health() == {
        "status": "degraded",
        "service": "media",
        "pipeline": "unavailable",
        "error": "No module named 'comfy_diffusion'",
    }


def test_us_003_ac03_health_reports_loading_while_pipeline_initialises() -> None:
    main.comfy_diffusion_import_error = None
    main.comfy_diffusion_pipeline_status = "loading"

    assert main.health() == {
        "status": "loading",
        "service": "media",
        "pipeline": "loading",
    }


def test_us_003_ac04_typecheck_lint_passes() -> None:
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
