from __future__ import annotations

import subprocess
from pathlib import Path

import jobs.image_jobs
import pipelines.comfy_diffusion
import routers.health
import routers.image_jobs
import schemas.image_job

MEDIA_DIR = Path(__file__).resolve().parents[1]
MAIN_PATH = MEDIA_DIR / "main.py"


def test_us_005_ac01_main_is_thin_router_composition_entrypoint() -> None:
    main_source = MAIN_PATH.read_text(encoding="utf-8")

    assert "lifespan=lifespan" in main_source
    assert "app.include_router(health_router)" in main_source
    assert "app.include_router(image_jobs_router)" in main_source
    assert "@app.get(" not in main_source
    assert "@app.post(" not in main_source


def test_us_005_ac02_modules_have_single_responsibility_boundaries() -> None:
    assert hasattr(routers.health, "router")
    assert hasattr(routers.image_jobs, "router")
    assert hasattr(jobs.image_jobs, "process_image_job")
    assert hasattr(pipelines.comfy_diffusion, "run_comfy_diffusion_illustrious_pipeline")
    assert hasattr(schemas.image_job, "GenerateImageRequest")

    routers_source = (MEDIA_DIR / "routers" / "image_jobs.py").read_text(encoding="utf-8")
    jobs_source = (MEDIA_DIR / "jobs" / "image_jobs.py").read_text(encoding="utf-8")
    pipelines_source = (MEDIA_DIR / "pipelines" / "comfy_diffusion.py").read_text(
        encoding="utf-8"
    )
    schemas_source = (MEDIA_DIR / "schemas" / "image_job.py").read_text(encoding="utf-8")

    assert "APIRouter" in routers_source
    assert "ThreadPoolExecutor" in jobs_source
    assert "comfy_diffusion" in pipelines_source
    assert "BaseModel" in schemas_source


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
