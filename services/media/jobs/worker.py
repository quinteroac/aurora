from __future__ import annotations

import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError

from jobs.store import JobStore

GENERATION_TIMEOUT_SECONDS = 120

logger = logging.getLogger("aurora.media.worker")


def run_generation_with_timeout(
    prompt: str,
    pipeline: Callable[[str], dict[str, str]],
    timeout_seconds: float = GENERATION_TIMEOUT_SECONDS,
) -> dict[str, str]:
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(pipeline, prompt)
    try:
        return future.result(timeout=timeout_seconds)
    except FutureTimeoutError as error:
        future.cancel()
        raise TimeoutError("generation timed out") from error
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def process_image_job(
    job_id: str,
    prompt: str,
    *,
    store: JobStore,
    pipeline: Callable[[str], dict[str, str]],
) -> None:
    store.update(job_id, status="running")
    try:
        result = run_generation_with_timeout(prompt, pipeline, GENERATION_TIMEOUT_SECONDS)
    except TimeoutError as error:
        store.update(job_id, status="failed", error=str(error))
        logger.exception("Image generation timed out for job_id=%s", job_id)
        return
    except Exception as error:
        store.update(job_id, status="failed", error=str(error))
        logger.exception("Image generation failed for job_id=%s", job_id)
        return

    store.update(job_id, status="done", result={"image_b64": result["image_b64"]}, error=None)
