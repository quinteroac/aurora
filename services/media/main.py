from __future__ import annotations

import importlib
import logging
from collections.abc import Callable
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException, status

from config import resolve_port
from jobs.image_jobs import (
    GENERATION_TIMEOUT_SECONDS as DEFAULT_GENERATION_TIMEOUT_SECONDS,
)
from jobs.image_jobs import (
    image_jobs as image_jobs_store,
)
from jobs.image_jobs import (
    process_image_job as process_image_job_impl,
)
from jobs.image_jobs import (
    run_generation_with_timeout as run_generation_with_timeout_impl,
)
from pipelines import state as pipeline_state
from pipelines.comfy_diffusion import (
    DEFAULT_PNG_BYTES as DEFAULT_PNG_BYTES_IMPL,
)
from pipelines.comfy_diffusion import (
    logger as pipeline_logger,
)
from pipelines.comfy_diffusion import (
    run_comfy_diffusion_illustrious_pipeline as run_comfy_diffusion_illustrious_pipeline_impl,
)
from pipelines.comfy_diffusion import (
    run_comfy_diffusion_smoke_test as run_comfy_diffusion_smoke_test_impl,
)
from routers.health import router as health_router
from routers.image_jobs import router as image_jobs_router
from schemas.image_job import (
    GenerateImageAcceptedResponse,
    GenerateImageRequest,
    JobResult,
    JobStatusResponse,
)

comfy_diffusion_import_error: str | None = pipeline_state.comfy_diffusion_import_error
comfy_diffusion_pipeline_status = pipeline_state.comfy_diffusion_pipeline_status
image_jobs: dict[str, dict[str, Any]] = image_jobs_store
GENERATION_TIMEOUT_SECONDS = DEFAULT_GENERATION_TIMEOUT_SECONDS
DEFAULT_PNG_BYTES = DEFAULT_PNG_BYTES_IMPL
logger: logging.Logger = pipeline_logger


def run_comfy_diffusion_smoke_test(
    importer: Callable[[str], object] | None = None,
) -> str | None:
    import_fn = importer if importer is not None else importlib.import_module
    return run_comfy_diffusion_smoke_test_impl(import_fn)


def startup() -> None:
    global comfy_diffusion_import_error
    global comfy_diffusion_pipeline_status

    comfy_diffusion_pipeline_status = "loading"
    pipeline_state.comfy_diffusion_pipeline_status = comfy_diffusion_pipeline_status

    comfy_diffusion_import_error = run_comfy_diffusion_smoke_test()
    comfy_diffusion_pipeline_status = (
        "ready" if comfy_diffusion_import_error is None else "unavailable"
    )

    pipeline_state.comfy_diffusion_import_error = comfy_diffusion_import_error
    pipeline_state.comfy_diffusion_pipeline_status = comfy_diffusion_pipeline_status


def health() -> dict[str, str]:
    if comfy_diffusion_pipeline_status == "loading":
        return {"status": "loading", "service": "media", "pipeline": "loading"}

    if comfy_diffusion_import_error is not None:
        return {
            "status": "degraded",
            "service": "media",
            "pipeline": "unavailable",
            "error": comfy_diffusion_import_error,
        }

    return {"status": "ok", "service": "media", "pipeline": "ready"}


def run_comfy_diffusion_illustrious_pipeline(prompt: str) -> dict[str, str]:
    return run_comfy_diffusion_illustrious_pipeline_impl(prompt)


def run_generation_with_timeout(
    prompt: str,
    timeout_seconds: float | None = None,
) -> dict[str, str]:
    effective_timeout = (
        GENERATION_TIMEOUT_SECONDS if timeout_seconds is None else timeout_seconds
    )
    return run_generation_with_timeout_impl(
        prompt,
        run_comfy_diffusion_illustrious_pipeline,
        effective_timeout,
    )


def process_image_job(job_id: str, prompt: str) -> None:
    process_image_job_impl(
        job_id,
        prompt,
        jobs_store=image_jobs,
        generate_with_timeout=run_generation_with_timeout,
        log_exception=logger.exception,
    )


def generate_image(
    request: GenerateImageRequest,
    background_tasks: BackgroundTasks,
) -> GenerateImageAcceptedResponse:
    job_id = str(uuid4())
    image_jobs[job_id] = {"status": "pending", "prompt": request.prompt}
    background_tasks.add_task(process_image_job, job_id, request.prompt)
    return GenerateImageAcceptedResponse(job_id=job_id)


def get_job_status(job_id: str) -> JobStatusResponse:
    job = image_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    job_status = str(job["status"])
    if job_status == "done":
        return JobStatusResponse(
            status=job_status,
            result=JobResult.model_validate(job["result"]),
            error=None,
        )

    if job_status == "failed":
        return JobStatusResponse(
            status=job_status,
            result=None,
            error=str(job.get("error", "unknown_error")),
        )

    return JobStatusResponse(status=job_status, result=None, error=None)


@asynccontextmanager
async def lifespan(_: FastAPI):
    startup()
    yield


app = FastAPI(title="Aurora Media Service", lifespan=lifespan)
app.include_router(health_router)
app.include_router(image_jobs_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=resolve_port(), reload=True)
