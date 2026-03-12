from __future__ import annotations

import base64
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from fastapi.responses import Response

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
    if request.app.state.pipeline is None:
        err = getattr(request.app.state, "pipeline_error", None) or "Check /health."
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Image pipeline unavailable (service started in degraded mode). {err}",
        )
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


@router.get("/jobs/{job_id}/image")
def get_job_image(job_id: str) -> Response:
    job = store.fetch(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    job_status = str(job["status"])
    if job_status != "done":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Job not ready (status={job_status})",
        )

    result = job.get("result") or {}
    image_b64 = result.get("image_b64")
    if not isinstance(image_b64, str) or image_b64.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Missing image data",
        )

    try:
        image_bytes = base64.b64decode(image_b64, validate=True)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Invalid image data",
        )

    return Response(content=image_bytes, media_type="image/png")
