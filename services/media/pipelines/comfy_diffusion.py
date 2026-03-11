from __future__ import annotations

import importlib
import logging
import sys
from collections.abc import Callable

logger = logging.getLogger("aurora.media.startup")
logger.setLevel(logging.INFO)
if not logger.handlers:
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(stdout_handler)
logger.propagate = False


def run_comfy_diffusion_smoke_test(
    importer: Callable[[str], object] | None = None,
) -> str | None:
    """Try to import comfy_diffusion; return the error message or None on success."""
    import_fn = importer if importer is not None else importlib.import_module

    try:
        import_fn("comfy_diffusion")
    except ImportError as error:
        message = str(error)
        logger.error("comfy_diffusion import smoke test failed: %s", message)
        return message

    logger.info("comfy_diffusion import smoke test passed")
    return None
