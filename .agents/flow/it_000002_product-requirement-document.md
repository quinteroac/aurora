# Requirement: Media Service Base — Async Image Generation

## Context

The game has no way to produce images yet. The Mastra backend agent (It.03) will need a real HTTP endpoint
it can call to generate scene images from text prompts. This iteration delivers that endpoint by building
a FastAPI async job layer over the existing `services/media` skeleton and wiring in the comfy-diffusion
Illustrious pipeline.

Image generation can take 30–120 seconds on a GPU, so a synchronous HTTP call would time out.
The solution uses FastAPI `BackgroundTasks` with an in-memory job store: the caller gets a `job_id`
immediately and polls a status endpoint until the result is ready. Redis (It.06) can replace the
in-memory store later without changing the public API.

## Goals

- Expose `POST /generate/image` that accepts a text prompt and returns a `job_id` instantly (HTTP 202).
- Expose `GET /jobs/{job_id}` that returns job status and, when done, a base64-encoded PNG.
- Expose `GET /health` that reports pipeline readiness (ok / loading / degraded).
- Handle errors and timeouts gracefully — no unhandled 500 crashes.
- Refactor `services/media` from a flat `main.py` into a modular package layout ready for future media types.

## Module Structure

```
services/media/
├── main.py                   # FastAPI app factory + lifespan startup
├── routers/
│   ├── health.py             # GET /health
│   └── generate.py           # POST /generate/image · GET /jobs/{job_id}
├── jobs/
│   ├── store.py              # Thread-safe in-memory job dict
│   └── worker.py             # BackgroundTask — runs pipeline, updates store
├── pipelines/
│   └── image.py              # comfy-diffusion Illustrious pipeline wrapper
├── schemas/
│   └── generate.py           # Pydantic request/response models
└── tests/
    ├── test_health.py
    ├── test_generate.py
    └── test_jobs.py
```

## User Stories

### US-001: Submit an image generation job

**As a** backend agent (Mastra), **I want** to POST a text prompt and receive a `job_id` immediately
**so that** I can continue executing while the image is being generated in the background.

**Acceptance Criteria:**
- [ ] `POST /generate/image` accepts JSON body `{ "prompt": "<text>" }`.
- [ ] Response is HTTP 202 with body `{ "job_id": "<uuid>" }`.
- [ ] The job is registered in the in-memory store with status `"pending"` before the response is returned.
- [ ] A background task is enqueued to run the comfy-diffusion Illustrious pipeline.
- [ ] Requests with missing or empty `prompt` return HTTP 422 (Pydantic validation error).
- [ ] Typecheck / lint passes.

---

### US-002: Poll job status and retrieve result

**As a** backend agent, **I want** to GET the status of a submitted job **so that** I know when the
image is ready and can retrieve it.

**Acceptance Criteria:**
- [ ] `GET /jobs/{job_id}` returns HTTP 200 with body:
  - `{ "status": "pending" | "running" | "done" | "failed", "result": null, "error": null }` while in progress.
  - `{ "status": "done", "result": { "image_b64": "<base64 PNG string>" }, "error": null }` when complete.
  - `{ "status": "failed", "result": null, "error": "<message>" }` on failure.
- [ ] Unknown `job_id` returns HTTP 404 with body `{ "detail": "Job not found" }`.
- [ ] `image_b64` is a valid base64-encoded PNG (decodable without error).
- [ ] Typecheck / lint passes.

---

### US-003: Health endpoint reports pipeline status

**As a** developer or orchestrator, **I want** `GET /health` to report whether the comfy-diffusion
pipeline loaded successfully **so that** dependent services can detect degraded state.

**Acceptance Criteria:**
- [ ] `GET /health` returns HTTP 200 with `{ "status": "ok", "service": "media", "pipeline": "ready" }` when the pipeline loaded successfully.
- [ ] Returns `{ "status": "degraded", "service": "media", "pipeline": "unavailable", "error": "<message>" }` when the pipeline failed to load.
- [ ] Returns `{ "status": "loading", "service": "media", "pipeline": "loading" }` while the pipeline is still initialising on startup.
- [ ] Typecheck / lint passes.

---

### US-004: Graceful error and timeout handling

**As a** backend agent, **I want** failed or timed-out jobs to return a structured error response
**so that** I can surface a meaningful message instead of crashing.

**Acceptance Criteria:**
- [ ] If the pipeline raises any exception during generation, the job transitions to `"failed"` with `error` set to the exception message.
- [ ] If generation exceeds 120 seconds, the job transitions to `"failed"` with `error: "generation timed out"`.
- [ ] No generation failure causes an unhandled HTTP 500 on any endpoint.
- [ ] Typecheck / lint passes.

---

### US-005: Modular package refactor

**As a** developer, **I want** `services/media` refactored into the module structure above
**so that** future media types (video, audio) can be added without touching unrelated code.

**Acceptance Criteria:**
- [ ] `main.py` is kept thin: imports routers and registers the lifespan startup event only.
- [ ] Each sub-module (`routers/`, `jobs/`, `pipelines/`, `schemas/`) contains only its own responsibility.
- [ ] All existing tests from It.01 (`tests/test_main.py`) continue to pass unchanged.
- [ ] Typecheck / lint passes.

---

## Functional Requirements

- **FR-1:** `POST /generate/image` → HTTP 202 `{ job_id: string }`. Body: `{ prompt: string }` (required, non-empty).
- **FR-2:** `GET /jobs/{job_id}` → HTTP 200 `{ status, result, error }` or HTTP 404 `{ detail }`.
- **FR-3:** Job statuses follow the lifecycle: `pending → running → done | failed`.
- **FR-4:** Background worker runs the comfy-diffusion Illustrious pipeline and updates job store atomically.
- **FR-5:** Generation timeout is 120 seconds; exceeded jobs move to `failed`.
- **FR-6:** `GET /health` returns one of `ok`, `loading`, or `degraded` with `pipeline` field.
- **FR-7:** All Pydantic models live in `schemas/generate.py`; no inline `dict` return types for structured responses.
- **FR-8:** In-memory job store in `jobs/store.py` uses `threading.Lock` (not `asyncio.Lock`) — FastAPI `BackgroundTasks` executes in a threadpool, not in the async event loop, so only OS-level locks are safe here.
- **FR-9:** The pipeline is implemented as a class (or callable) with a clear interface and registered on `app.state` during the FastAPI lifespan — never imported directly inside the worker. The worker receives the pipeline instance via `app.state`, making it trivially replaceable with a mock in tests without monkeypatching imports.
- **FR-10 (implementation note):** Before writing `pipelines/image.py`, the implementer **must** read `comfy_diffusion/skills/SKILL.md` via:
  ```python
  from comfy_diffusion.skills import get_skills_path
  skill_text = (get_skills_path() / "SKILL.md").read_text(encoding="utf-8")
  ```
  That file is the authoritative source of truth for the comfy-diffusion Python API. The confirmed signatures for the Illustrious (SDXL) pipeline are:
  ```python
  # Model loading
  from comfy_diffusion.models import ModelManager, CheckpointResult
  mgr = ModelManager(models_dir)                    # registers models_dir with ComfyUI folder_paths
  result: CheckpointResult = mgr.load_checkpoint(filename)  # .model, .clip, .vae

  # Prompt encoding
  from comfy_diffusion.conditioning import encode_prompt
  positive = encode_prompt(clip, text)              # empty string normalised to " "
  negative = encode_prompt(clip, "")

  # Empty latent
  from comfy_diffusion.latent import empty_latent_image
  latent = empty_latent_image(width, height, batch_size=1)  # returns {"samples": tensor}

  # Sampling
  from comfy_diffusion.sampling import sample
  denoised = sample(model, positive, negative, latent, steps, cfg,
                    sampler_name, scheduler, seed, denoise=1.0)

  # VAE decode → PIL Image
  from comfy_diffusion.vae import vae_decode
  image: PIL.Image.Image = vae_decode(vae, denoised)
  ```
  Do not guess or infer signatures from other sources.
- **FR-11:** Pytest tests cover all three endpoints with the pipeline mocked; at least one integration test documents the real end-to-end flow.

## Non-Goals (Out of Scope)

- Persistent job storage (Redis queue — deferred to It.06).
- Video or audio generation endpoints (deferred to It.13, It.11–It.12).
- Authentication or API key protection on endpoints.
- Job cancellation or deletion.
- Multiple concurrent pipeline workers / worker pool management.
- Frontend UI changes (deferred to It.04).
- Mastra agent integration (deferred to It.03).
- Production deployment configuration.

## Open Questions

- None — all decisions resolved during requirement interview.
