from __future__ import annotations

import time

import pytest

import main


@pytest.fixture(autouse=True)
def reset_image_jobs() -> None:
    main.image_jobs.clear()


def test_us_004_ac01_pipeline_exception_marks_job_failed_with_error_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_pipeline(_: str) -> dict[str, str]:
        raise RuntimeError("pipeline exploded")

    main.image_jobs["job-error"] = {"status": "pending", "prompt": "Storm over citadel"}
    monkeypatch.setattr(main, "run_comfy_diffusion_illustrious_pipeline", fake_pipeline)

    main.process_image_job("job-error", "Storm over citadel")

    assert main.image_jobs["job-error"]["status"] == "failed"
    assert main.image_jobs["job-error"]["error"] == "pipeline exploded"


def test_us_004_ac02_generation_timeout_marks_job_failed_with_timeout_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def slow_pipeline(_: str) -> dict[str, str]:
        time.sleep(0.05)
        return {"image_b64": "irrelevant"}

    main.image_jobs["job-timeout"] = {"status": "pending", "prompt": "Frozen valley"}
    monkeypatch.setattr(main, "GENERATION_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(main, "run_comfy_diffusion_illustrious_pipeline", slow_pipeline)

    main.process_image_job("job-timeout", "Frozen valley")

    assert main.image_jobs["job-timeout"]["status"] == "failed"
    assert main.image_jobs["job-timeout"]["error"] == "generation timed out"


def test_us_004_ac03_generation_failure_does_not_raise_http_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_add_task(_: object, function: object, job_id: str, prompt: str) -> None:
        function(job_id, prompt)

    def fail_generation(_: str, __: float = 120) -> dict[str, str]:
        raise RuntimeError("pipeline exploded")

    monkeypatch.setattr(main.BackgroundTasks, "add_task", fake_add_task)
    monkeypatch.setattr(main, "run_generation_with_timeout", fail_generation)

    request = main.GenerateImageRequest.model_validate({"prompt": "Echoing ruins"})
    accepted = main.generate_image(request=request, background_tasks=main.BackgroundTasks())
    response = main.get_job_status(accepted.job_id)

    assert accepted.job_id in main.image_jobs
    assert response.model_dump() == {
        "status": "failed",
        "result": None,
        "error": "pipeline exploded",
    }
