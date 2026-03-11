from __future__ import annotations

import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

MEDIA_DIR = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# AC01 — /health → "ok" when pipeline loaded successfully
# ---------------------------------------------------------------------------

def test_us_003_ac01_health_reports_ready_when_pipeline_loaded(
    client: TestClient,
) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "service": "media", "pipeline": "ready"}


# ---------------------------------------------------------------------------
# AC02 — /health → "degraded" when pipeline failed to load
# ---------------------------------------------------------------------------

def test_us_003_ac02_health_reports_degraded_when_pipeline_load_fails(
    degraded_client: TestClient,
) -> None:
    resp = degraded_client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {
        "status": "degraded",
        "service": "media",
        "pipeline": "unavailable",
        "error": "No module named 'comfy_diffusion'",
    }


# ---------------------------------------------------------------------------
# AC03 — /health → "loading" while pipeline still initialising
# ---------------------------------------------------------------------------

def test_us_003_ac03_health_reports_loading_while_pipeline_initialises(
    loading_client: TestClient,
) -> None:
    resp = loading_client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {
        "status": "loading",
        "service": "media",
        "pipeline": "loading",
    }


# ---------------------------------------------------------------------------
# AC04 — Lint / typecheck passes
# ---------------------------------------------------------------------------

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
