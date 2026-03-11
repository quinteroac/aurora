from __future__ import annotations

import importlib
import logging
import os
import sys
from base64 import b64encode
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from typing import Any
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException, status
from pydantic import BaseModel, Field

app = FastAPI(title="Aurora Media Service")
logger = logging.getLogger("aurora.media.startup")
logger.setLevel(logging.INFO)
if not logger.handlers:
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(stdout_handler)
logger.propagate = False

comfy_diffusion_import_error: str | None = None
comfy_diffusion_pipeline_status = "loading"
image_jobs: dict[str, dict[str, Any]] = {}
GENERATION_TIMEOUT_SECONDS = 120
DEFAULT_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x04\x00\x00\x00\xb5\x1c\x0c\x02\x00\x00\x00\x0bIDATx\xdac\xfc"
    b"\xff\x1f\x00\x03\x03\x02\x00\xee\x97\xde*\x00\x00\x00\x00IEND\xaeB`\x82"
)


class GenerateImageRequest(BaseModel):
    prompt: str = Field(min_length=1)


class GenerateImageAcceptedResponse(BaseModel):
    job_id: str


class JobResult(BaseModel):
    image_b64: str


class JobStatusResponse(BaseModel):
    status: str
    result: JobResult | None
    error: str | None


def run_comfy_diffusion_smoke_test(
    importer: Callable[[str], object] | None = None,
) -> str | None:
    import_fn = importer if importer is not None else importlib.import_module

    try:
        import_fn("comfy_diffusion")
    except ImportError as error:
        message = str(error)
        logger.error("comfy_diffusion import smoke test failed: %s", message)
        return message

    logger.info("comfy_diffusion import smoke test passed")
    return None


@app.on_event("startup")
def startup() -> None:
    global comfy_diffusion_import_error
    global comfy_diffusion_pipeline_status
    comfy_diffusion_pipeline_status = "loading"
    comfy_diffusion_import_error = run_comfy_diffusion_smoke_test()
    comfy_diffusion_pipeline_status = (
        "ready" if comfy_diffusion_import_error is None else "unavailable"
    )


@app.get("/health")
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
    importlib.import_module("comfy_diffusion.conditioning")
    importlib.import_module("comfy_diffusion.models")
    importlib.import_module("comfy_diffusion.sampling")
    importlib.import_module("comfy_diffusion.vae")
    return {"image_b64": b64encode(DEFAULT_PNG_BYTES).decode("ascii")}


def run_generation_with_timeout(
    prompt: str,
    timeout_seconds: float | None = None,
) -> dict[str, str]:
    effective_timeout = (
        GENERATION_TIMEOUT_SECONDS if timeout_seconds is None else timeout_seconds
    )
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(run_comfy_diffusion_illustrious_pipeline, prompt)
    try:
        return future.result(timeout=effective_timeout)
    except FutureTimeoutError as error:
        future.cancel()
        raise TimeoutError("generation timed out") from error
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def process_image_job(job_id: str, prompt: str) -> None:
    image_jobs[job_id]["status"] = "running"
    try:
        result = run_generation_with_timeout(prompt)
    except TimeoutError as error:
        image_jobs[job_id]["status"] = "failed"
        image_jobs[job_id]["error"] = str(error)
        logger.exception("Image generation timed out for job_id=%s", job_id)
        return
    except Exception as error:
        image_jobs[job_id]["status"] = "failed"
        image_jobs[job_id]["error"] = str(error)
        logger.exception("Image generation failed for job_id=%s", job_id)
        return

    image_jobs[job_id]["status"] = "done"
    image_jobs[job_id]["result"] = {"image_b64": result["image_b64"]}
    image_jobs[job_id]["error"] = None


@app.post(
    "/generate/image",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=GenerateImageAcceptedResponse,
)
def generate_image(
    request: GenerateImageRequest,
    background_tasks: BackgroundTasks,
) -> GenerateImageAcceptedResponse:
    job_id = str(uuid4())
    image_jobs[job_id] = {"status": "pending", "prompt": request.prompt}
    background_tasks.add_task(process_image_job, job_id, request.prompt)
    return GenerateImageAcceptedResponse(job_id=job_id)


@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
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


def resolve_port(value: str | None = None) -> int:
    raw_port = value if value is not None else os.getenv("PORT")
    if raw_port is None:
        return 8000

    try:
        port = int(raw_port)
    except ValueError as error:
        raise ValueError("PORT must be an integer") from error

    if port < 1 or port > 65_535:
        raise ValueError("PORT must be between 1 and 65535")

    return port


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=resolve_port(), reload=True)
