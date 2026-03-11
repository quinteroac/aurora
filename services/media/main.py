from __future__ import annotations

import importlib
import logging
import os
import sys
from collections.abc import Callable

from fastapi import FastAPI

app = FastAPI(title="Aurora Media Service")
logger = logging.getLogger("aurora.media.startup")
logger.setLevel(logging.INFO)
if not logger.handlers:
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(stdout_handler)
logger.propagate = False

comfy_diffusion_import_error: str | None = None


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
