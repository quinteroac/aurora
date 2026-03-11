from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

import jobs.worker as worker_module
from jobs.store import store as job_store
from jobs.worker import process_image_job, run_generation_with_timeout

# ---------------------------------------------------------------------------
# AC01 — Pipeline exception marks job "failed" with the exception message
# ---------------------------------------------------------------------------

def test_us_004_ac01_pipeline_exception_marks_job_failed_with_error_message() -> None:
    def fail_pipeline(prompt: str) -> dict[str, str]:
        raise RuntimeError("pipeline exploded")

    job_store.clear()
    job_store.create("job-error", {"status": "pending", "prompt": "Storm over citadel"})

    process_image_job(
        "job-error",
        "Storm over citadel",
        store=job_store,
        pipeline=fail_pipeline,
    )

    job = job_store.fetch("job-error")
    assert job is not None
    assert job["status"] == "failed"
    assert job["error"] == "pipeline exploded"


# ---------------------------------------------------------------------------
# AC02 — Timeout marks job "failed" with "generation timed out"
# ---------------------------------------------------------------------------

def test_us_004_ac02_run_generation_with_timeout_raises_on_slow_pipeline() -> None:
    def slow(prompt: str) -> dict[str, str]:
        time.sleep(0.05)
        return {"image_b64": "irrelevant"}

    with pytest.raises(TimeoutError, match="generation timed out"):
        run_generation_with_timeout(slow.__name__, slow, timeout_seconds=0.01)


def test_us_004_ac02_generation_timeout_marks_job_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def slow_pipeline(prompt: str) -> dict[str, str]:
        time.sleep(0.05)
        return {"image_b64": "irrelevant"}

    monkeypatch.setattr(worker_module, "GENERATION_TIMEOUT_SECONDS", 0.01)

    job_store.clear()
    job_store.create("job-timeout", {"status": "pending", "prompt": "Frozen valley"})

    process_image_job(
        "job-timeout",
        "Frozen valley",
        store=job_store,
        pipeline=slow_pipeline,
    )

    job = job_store.fetch("job-timeout")
    assert job is not None
    assert job["status"] == "failed"
    assert job["error"] == "generation timed out"


# ---------------------------------------------------------------------------
# AC03 — No generation failure causes an unhandled HTTP 500
# ---------------------------------------------------------------------------

def test_us_004_ac03_generation_failure_does_not_raise_http_500(
    failing_client: TestClient,
) -> None:
    submit = failing_client.post("/generate/image", json={"prompt": "Echoing ruins"})
    assert submit.status_code == 202
    job_id = submit.json()["job_id"]

    status_resp = failing_client.get(f"/jobs/{job_id}")
    assert status_resp.status_code == 200
    payload = status_resp.json()
    assert payload["status"] == "failed"
    assert isinstance(payload["error"], str)
    assert payload["result"] is None
