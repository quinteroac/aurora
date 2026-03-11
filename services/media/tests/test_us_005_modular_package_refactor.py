from __future__ import annotations

import subprocess
from pathlib import Path

import jobs.store
import jobs.worker
import pipelines.comfy_diffusion
import pipelines.image
import routers.generate
import routers.health
import schemas.generate

MEDIA_DIR = Path(__file__).resolve().parents[1]
MAIN_PATH = MEDIA_DIR / "main.py"


# ---------------------------------------------------------------------------
# AC01 — main.py is thin: imports routers and registers lifespan only
# ---------------------------------------------------------------------------

def test_us_005_ac01_main_is_thin_router_composition_entrypoint() -> None:
    main_source = MAIN_PATH.read_text(encoding="utf-8")

    assert "lifespan=lifespan" in main_source
    assert "app.include_router(health_router)" in main_source
    assert "app.include_router(generate_router)" in main_source
    assert "@app.get(" not in main_source
    assert "@app.post(" not in main_source
    # No business logic functions in main
    assert "def generate_image" not in main_source
    assert "def get_job_status" not in main_source
    assert "def health(" not in main_source


# ---------------------------------------------------------------------------
# AC02 — Each sub-module contains only its own responsibility
# ---------------------------------------------------------------------------

def test_us_005_ac02_modules_have_single_responsibility_boundaries() -> None:
    assert hasattr(routers.generate, "router")
    assert hasattr(routers.health, "router")
    assert hasattr(jobs.worker, "process_image_job")
    assert hasattr(jobs.store, "store")
    assert hasattr(pipelines.image, "IllustriousPipeline")
    assert hasattr(schemas.generate, "GenerateImageRequest")

    routers_source = (MEDIA_DIR / "routers" / "generate.py").read_text(encoding="utf-8")
    jobs_worker_source = (MEDIA_DIR / "jobs" / "worker.py").read_text(encoding="utf-8")
    jobs_store_source = (MEDIA_DIR / "jobs" / "store.py").read_text(encoding="utf-8")
    pipelines_source = (MEDIA_DIR / "pipelines" / "image.py").read_text(encoding="utf-8")
    schemas_source = (MEDIA_DIR / "schemas" / "generate.py").read_text(encoding="utf-8")

    assert "APIRouter" in routers_source
    assert "ThreadPoolExecutor" in jobs_worker_source
    assert "threading.Lock" in jobs_store_source
    assert "IllustriousPipeline" in pipelines_source
    assert "BaseModel" in schemas_source

    # Worker must NOT import the pipeline directly
    assert "from pipelines" not in jobs_worker_source
    assert "import pipelines" not in jobs_worker_source


# ---------------------------------------------------------------------------
# AC03 — All existing tests from It.01 (tests/test_main.py) pass
# ---------------------------------------------------------------------------

def test_us_005_ac03_test_main_suite_passes() -> None:
    result = subprocess.run(
        ["uv", "run", "pytest", "tests/test_main.py", "-v"],
        cwd=MEDIA_DIR,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


# ---------------------------------------------------------------------------
# AC04 — Lint / typecheck passes
# ---------------------------------------------------------------------------

def test_us_005_ac04_typecheck_lint_passes() -> None:
    lint = subprocess.run(
        ["uv", "run", "ruff", "check", "."],
        cwd=MEDIA_DIR,
        check=False,
        capture_output=True,
        text=True,
    )
    compile_check = subprocess.run(
        ["uv", "run", "python", "-m", "compileall", "."],
        cwd=MEDIA_DIR,
        check=False,
        capture_output=True,
        text=True,
    )

    assert lint.returncode == 0, lint.stdout + lint.stderr
    assert compile_check.returncode == 0, compile_check.stdout + compile_check.stderr
