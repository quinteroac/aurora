from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from jobs.image_jobs import image_jobs, process_image_job, run_generation_with_timeout
from pipelines.comfy_diffusion import logger, run_comfy_diffusion_illustrious_pipeline
from schemas.image_job import (
    GenerateImageAcceptedResponse,
    GenerateImageRequest,
    JobResult,
    JobStatusResponse,
)

router = APIRouter()


@router.post(
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
    background_tasks.add_task(process_image_job_entrypoint, job_id, request.prompt)
    return GenerateImageAcceptedResponse(job_id=job_id)


def process_image_job_entrypoint(job_id: str, prompt: str) -> None:
    process_image_job(
        job_id,
        prompt,
        jobs_store=image_jobs,
        generate_with_timeout=lambda current_prompt: run_generation_with_timeout(
            current_prompt,
            run_comfy_diffusion_illustrious_pipeline,
            120,
        ),
        log_exception=logger.exception,
    )


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
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
