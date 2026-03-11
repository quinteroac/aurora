from __future__ import annotations

comfy_diffusion_import_error: str | None = None
comfy_diffusion_pipeline_status = "loading"


def get_health_payload() -> dict[str, str]:
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
