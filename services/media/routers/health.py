from __future__ import annotations

from fastapi import APIRouter

from pipelines.state import get_health_payload

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return get_health_payload()
