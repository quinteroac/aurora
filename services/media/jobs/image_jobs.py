from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from typing import Any

image_jobs: dict[str, dict[str, Any]] = {}
GENERATION_TIMEOUT_SECONDS = 120


def run_generation_with_timeout(
    prompt: str,
    generate_image: Callable[[str], dict[str, str]],
    timeout_seconds: float,
) -> dict[str, str]:
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(generate_image, prompt)
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
    jobs_store: dict[str, dict[str, Any]],
    generate_with_timeout: Callable[[str], dict[str, str]],
    log_exception: Callable[[str, str], None],
) -> None:
    jobs_store[job_id]["status"] = "running"
    try:
        result = generate_with_timeout(prompt)
    except TimeoutError as error:
        jobs_store[job_id]["status"] = "failed"
        jobs_store[job_id]["error"] = str(error)
        log_exception("Image generation timed out for job_id=%s", job_id)
        return
    except Exception as error:
        jobs_store[job_id]["status"] = "failed"
        jobs_store[job_id]["error"] = str(error)
        log_exception("Image generation failed for job_id=%s", job_id)
        return

    jobs_store[job_id]["status"] = "done"
    jobs_store[job_id]["result"] = {"image_b64": result["image_b64"]}
    jobs_store[job_id]["error"] = None
