# Requirement: Project Scaffold & Monorepo

## Context

Aurora is an agentic RPG whose tech stack spans three runtimes: a TypeScript backend (Bun + ElysiaJS), a React frontend (Vite), and a Python media service (FastAPI + comfy-diffusion). Before any feature work can begin, all three services must exist as a runnable, wired-together skeleton so that every subsequent iteration builds on a known-good base.

This iteration delivers that foundation: workspace layout, inter-service health checks, environment variable convention, unified run scripts, and a comfy-diffusion import smoke test inside the media service.

## Goals

- Establish the monorepo workspace structure (`apps/backend`, `apps/frontend`, `services/media`) managed by Bun.
- Confirm all three services start and respond to `GET /health`.
- Verify `comfy-diffusion` can be imported inside the media service (library installed correctly via `uv`).
- Provide a single `bun run dev` (or equivalent) script that boots the full stack.
- Lay down the environment variable convention with `.env.example`.

## User Stories

### US-001: Monorepo workspace initialised

**As a** developer, **I want** a Bun-managed monorepo with three workspace packages (`apps/backend`, `apps/frontend`, `services/media`) **so that** I can install all dependencies and run any service from the repo root.

**Acceptance Criteria:**
- [ ] Root `package.json` declares workspaces: `apps/backend`, `apps/frontend`, `services/media`.
- [ ] `bun install` at the repo root succeeds and all workspace dependencies are resolved.
- [ ] Python dependencies in `services/media` are managed with `uv` (`pyproject.toml` + `uv.lock`).
- [ ] Typecheck / lint passes.

---

### US-002: Backend service scaffolded and healthy

**As a** developer, **I want** `apps/backend` to be a minimal ElysiaJS app on Bun **so that** I can verify the backend is running via a health endpoint.

**Acceptance Criteria:**
- [ ] `apps/backend` has its own `package.json` (Bun workspace member) with `elysia` as a dependency.
- [ ] `GET /health` returns HTTP 200 with JSON `{ "status": "ok", "service": "backend" }`.
- [ ] Service starts with `bun run dev` inside `apps/backend`.
- [ ] Default port is `3000` (configurable via `PORT` env var).
- [ ] Typecheck / lint passes.

---

### US-003: Frontend service scaffolded and reachable

**As a** developer, **I want** `apps/frontend` to be a minimal Vite + React (TypeScript) app **so that** I can open it in a browser and confirm it loads.

**Acceptance Criteria:**
- [ ] `apps/frontend` is scaffolded with Vite + React + TypeScript template.
- [ ] `bun run dev` inside `apps/frontend` starts the Vite dev server on port `5173` (configurable).
- [ ] Opening `http://localhost:5173` in a browser renders the default Vite/React placeholder page without console errors.
- [ ] Typecheck / lint passes.
- [ ] Visually verified in browser.

---

### US-004: Media service scaffolded and healthy

**As a** developer, **I want** `services/media` to be a minimal FastAPI app managed with `uv` **so that** I can verify the service is running via a health endpoint.

**Acceptance Criteria:**
- [ ] `services/media` has a `pyproject.toml` declaring `fastapi`, `uvicorn`, and `comfy-diffusion` as dependencies.
- [ ] `uv sync` inside `services/media` installs all dependencies without errors.
- [ ] `GET /health` returns HTTP 200 with JSON `{ "status": "ok", "service": "media" }`.
- [ ] Service starts with `uv run uvicorn main:app --reload` (or equivalent script).
- [ ] Default port is `8000` (configurable via `PORT` env var).
- [ ] Typecheck / lint passes (ruff or flake8 as available).

---

### US-005: comfy-diffusion import smoke test

**As a** developer, **I want** the media service startup to confirm `comfy-diffusion` imports successfully **so that** I know the library is installed and the pipeline can be used in future iterations.

**Acceptance Criteria:**
- [ ] On application startup, `import comfy_diffusion` (or the library's public API) executes without raising an `ImportError`.
- [ ] If the import fails, the `GET /health` response includes `{ "status": "degraded", "error": "<message>" }` instead of `"ok"`.
- [ ] The import result is logged to stdout on startup.

---

### US-006: Environment variable convention

**As a** developer, **I want** a root-level `.env.example` listing all required and optional environment variables **so that** any contributor can set up the project without hunting for undocumented config.

**Acceptance Criteria:**
- [ ] `.env.example` exists at the repo root with entries for: `BACKEND_PORT`, `FRONTEND_PORT`, `MEDIA_PORT`, `OPENAI_API_KEY` (placeholder), `ANTHROPIC_API_KEY` (placeholder).
- [ ] Each entry has an inline comment describing its purpose.
- [ ] `.env` is listed in `.gitignore`.
- [ ] Typecheck / lint passes.

---

### US-007: Unified run scripts

**As a** developer, **I want** root-level Bun scripts to start all services **so that** I can boot the entire stack with one command.

**Acceptance Criteria:**
- [ ] Root `package.json` includes a `dev` script that concurrently starts the backend, frontend, and media service.
- [ ] `bun run dev` from the repo root boots all three services without manual intervention.
- [ ] Each service's output is identifiable in the combined log (prefixed or colour-coded).
- [ ] Typecheck / lint passes.

---

## Functional Requirements

- **FR-1:** The monorepo root uses Bun workspaces; all TypeScript packages are members.
- **FR-2:** Python dependency management in `services/media` uses `uv` exclusively (no pip/poetry); `pyproject.toml` targets `python = ">=3.12"`.
- **FR-3:** Backend (`apps/backend`) exposes `GET /health` → `200 { status, service }`.
- **FR-4:** Media service (`services/media`) exposes `GET /health` → `200 { status, service }` (or `{ status: "degraded", error }` if comfy-diffusion import fails).
- **FR-5:** Frontend (`apps/frontend`) is a Vite + React + TypeScript project loadable in the browser.
- **FR-6:** `comfy-diffusion` is declared as a dependency in `services/media/pyproject.toml` and its import is verified at startup.
- **FR-7:** `.env.example` documents all environment variables used across the monorepo.
- **FR-8:** A root-level `dev` script uses `concurrently` to start all three services in parallel, with colour-coded per-service log prefixes and automatic kill-all if any service exits with an error.

## Non-Goals (Out of Scope)

- Implementing any game feature (chat, image generation, NPC logic, etc.).
- Setting up a database or Redis (deferred to It.06).
- Authentication or security hardening.
- CI/CD pipeline configuration.
- Docker / Podman container setup (deferred to It.06 or later).
- Actual comfy-diffusion pipeline execution or image generation (deferred to It.02).
- Production build or deployment scripts.

## Decisions (formerly Open Questions)

- **Concurrent dev script:** use `concurrently` (npm package). Provides per-service colour-coded prefixes and kills all processes if one fails.
- **Python version:** `pyproject.toml` targets `>=3.12`.
