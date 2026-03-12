from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from config import resolve_port
from pipelines.image import IllustriousPipeline
from routers.generate import router as generate_router
from routers.health import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pipeline_status = "loading"
    app.state.pipeline_error = None

    # 1. Bootstrap ComfyUI path (check_runtime ensures vendor is on path)
    from comfy_diffusion import check_runtime

    runtime_info = check_runtime()
    # check_runtime() returns dict with "error" key on failure; no "status" key on success
    if runtime_info.get("error") is not None:
        app.state.pipeline = None
        app.state.pipeline_status = "degraded"
        app.state.pipeline_error = str(runtime_info)
    else:
        # 2. Now safe to instantiate pipeline (ModelManager will use folder_paths)
        try:
            models_dir = os.environ.get("MODELS_DIR", "models")
            app.state.pipeline = IllustriousPipeline(models_dir=models_dir)
            app.state.pipeline_status = "ready"
        except Exception as e:
            app.state.pipeline = None
            app.state.pipeline_status = "degraded"
            app.state.pipeline_error = str(e)

    yield


app = FastAPI(title="Aurora Media Service", lifespan=lifespan)
app.include_router(health_router)
app.include_router(generate_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=resolve_port(), reload=True)
