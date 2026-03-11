from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status

from jobs.store import store
from jobs.worker import process_image_job
from schemas.generate import (
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
    request: Request,
    body: GenerateImageRequest,
    background_tasks: BackgroundTasks,
) -> GenerateImageAcceptedResponse:
    job_id = str(uuid4())
    store.create(job_id, {"status": "pending", "prompt": body.prompt})
    background_tasks.add_task(
        process_image_job,
        job_id,
        body.prompt,
        store=store,
        pipeline=request.app.state.pipeline,
    )
    return GenerateImageAcceptedResponse(job_id=job_id)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(job_id: str) -> JobStatusResponse:
    job = store.fetch(job_id)
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
