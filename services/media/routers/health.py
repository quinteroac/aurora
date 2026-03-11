from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
def health(request: Request) -> dict[str, str]:
    status = request.app.state.pipeline_status
    error: str | None = request.app.state.pipeline_error

    if status == "loading":
        return {"status": "loading", "service": "media", "pipeline": "loading"}

    if error is not None:
        return {
            "status": "degraded",
            "service": "media",
            "pipeline": "unavailable",
            "error": error,
        }

    return {"status": "ok", "service": "media", "pipeline": "ready"}
