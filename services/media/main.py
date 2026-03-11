from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from config import resolve_port
from pipelines.comfy_diffusion import run_comfy_diffusion_smoke_test
from pipelines.image import IllustriousPipeline
from routers.generate import router as generate_router
from routers.health import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pipeline_status = "loading"
    app.state.pipeline_error = None

    error = run_comfy_diffusion_smoke_test()
    if error is None:
        app.state.pipeline = IllustriousPipeline()
        app.state.pipeline_status = "ready"
    else:
        app.state.pipeline = None
        app.state.pipeline_status = "unavailable"
        app.state.pipeline_error = error

    yield


app = FastAPI(title="Aurora Media Service", lifespan=lifespan)
app.include_router(health_router)
app.include_router(generate_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=resolve_port(), reload=True)
