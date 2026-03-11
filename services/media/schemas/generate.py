from __future__ import annotations

from pydantic import BaseModel, Field


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
