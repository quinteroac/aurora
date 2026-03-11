# Project Context

<!-- Created or updated by `bun nvst create project-context`. Cap: 250 lines. -->

## Conventions
- Naming: `kebab-case` for files and dirs; `camelCase` for variables/functions; `PascalCase` for React components and TypeScript types; `snake_case` for Python
- Formatting: Prettier + ESLint (TypeScript/React); Ruff (Python — format + lint)
- Git flow: Feature branches per iteration (`feature/it_XXXXXX`); squash-merge to `main`
- Commit convention: conventional commits (`feat:`, `fix:`, `chore:`, etc.)
- Workflow: Define → Approve → Prototype per iteration; update `PROJECT_CONTEXT` at end of each phase

## Tech Stack
- Languages: TypeScript 5.x (backend + frontend), Python ≥ 3.12 (media service)
- Runtime: Bun (TypeScript services), CPython 3.12 (media service)
- Frameworks: ElysiaJS (backend), Vite + React 18 + TypeScript (frontend), FastAPI (media service)
- Key libraries: Mastra (agent framework), assistant-ui (chat UI), React Three Fiber (3D), PostgreSQL + pgvector, Redis, comfy-diffusion
- Package manager: Bun (TypeScript workspaces), uv (Python — `pyproject.toml` + `uv.lock`)
- Build / tooling: Bun bundler, Vite (frontend), Ruff (Python lint/format), ESLint + Prettier (TS)

## Code Standards
- Style: functional React components; async/await over callbacks; no `any` in TypeScript
- Error handling: structured error objects or `Result`-style returns; never swallow exceptions; degraded `{ status: "degraded", error }` health responses instead of crashes
- Module organisation: each workspace is self-contained (`package.json` or `pyproject.toml`); cross-service communication via HTTP only — no shared source imports
- Forbidden patterns: `npm`, `pip`, `poetry` (use `bun` and `uv`); `console.log` in production paths (use structured logging)

## Testing Strategy
- Approach: TDD — tests written before implementation
- Runners: Vitest (`apps/frontend`), Bun built-in test runner (`apps/backend`), Pytest (`services/media`)
- Coverage targets: none enforced yet; expand per iteration
- Test location: co-located `__tests__/` dirs or `.test.ts` / `_test.py` files alongside the modules they test

## Product Architecture
- Description: Agentic RPG — player defines a universe; an LLM agent builds and narrates it with real-time generated media
- Main layers: Browser (React + R3F + assistant-ui) ↔ Backend (ElysiaJS + Mastra agent) ↔ Media Service (FastAPI + comfy-diffusion) ↔ LLM APIs (OpenAI / Anthropic)
- Data flow: Player message → WebSocket → Mastra agent → narrative + `generate_image` tool call → Media Service → image/video/audio → streamed back to browser
- Persistence: PostgreSQL + pgvector (world state, embeddings), Redis (session / pub-sub)

## Modular Structure
- `apps/backend`: ElysiaJS server, Mastra agent, REST + WebSocket endpoints, DB/Redis integration
- `apps/frontend`: Vite + React SPA, assistant-ui chat interface, React Three Fiber 3D scene
- `services/media`: FastAPI service, comfy-diffusion pipelines, image/video/audio generation endpoints

## Environment Variables
- Documented in `.env.example` at repo root
- Key vars: `BACKEND_PORT` (3000), `FRONTEND_PORT` (5173), `MEDIA_PORT` (8000), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- `.env` is gitignored; never commit secrets

## Implemented Capabilities
<!-- Updated at the end of each iteration by bun nvst create project-context -->
- (none yet — populated after first Refactor)
