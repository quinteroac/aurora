from __future__ import annotations

import importlib
import logging
import os
import sys
from collections.abc import Callable
from typing import Any
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, status
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
image_jobs: dict[str, dict[str, Any]] = {}


class GenerateImageRequest(BaseModel):
    prompt: str = Field(min_length=1)


class GenerateImageAcceptedResponse(BaseModel):
    job_id: str


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
    comfy_diffusion_import_error = run_comfy_diffusion_smoke_test()


@app.get("/health")
def health() -> dict[str, str]:
    if comfy_diffusion_import_error is not None:
        return {"status": "degraded", "error": comfy_diffusion_import_error}

    return {"status": "ok", "service": "media"}


def run_comfy_diffusion_illustrious_pipeline(prompt: str) -> dict[str, str]:
    importlib.import_module("comfy_diffusion.conditioning")
    importlib.import_module("comfy_diffusion.models")
    importlib.import_module("comfy_diffusion.sampling")
    importlib.import_module("comfy_diffusion.vae")
    return {"pipeline": "illustrious", "prompt": prompt}


def process_image_job(job_id: str, prompt: str) -> None:
    try:
        result = run_comfy_diffusion_illustrious_pipeline(prompt)
    except Exception:
        image_jobs[job_id]["status"] = "failed"
        image_jobs[job_id]["error"] = "illustrious_pipeline_failed"
        logger.exception("Image generation failed for job_id=%s", job_id)
        return

    image_jobs[job_id]["status"] = "completed"
    image_jobs[job_id]["result"] = result


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
