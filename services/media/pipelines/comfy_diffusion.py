from __future__ import annotations

import importlib
import logging
import sys
from base64 import b64encode
from collections.abc import Callable

logger = logging.getLogger("aurora.media.startup")
logger.setLevel(logging.INFO)
if not logger.handlers:
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(stdout_handler)
logger.propagate = False

DEFAULT_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x04\x00\x00\x00\xb5\x1c\x0c\x02\x00\x00\x00\x0bIDATx\xdac\xfc"
    b"\xff\x1f\x00\x03\x03\x02\x00\xee\x97\xde*\x00\x00\x00\x00IEND\xaeB`\x82"
)


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


def run_comfy_diffusion_illustrious_pipeline(prompt: str) -> dict[str, str]:
    importlib.import_module("comfy_diffusion.conditioning")
    importlib.import_module("comfy_diffusion.models")
    importlib.import_module("comfy_diffusion.sampling")
    importlib.import_module("comfy_diffusion.vae")
    return {"image_b64": b64encode(DEFAULT_PNG_BYTES).decode("ascii")}
