# Requirement: Mastra Agent Base — Narrator Agent with Chat & WebSocket Endpoints

## Context

The Media Service (It.02) can generate images but there is no agent layer yet to receive player
messages, reason about them, and produce narrative responses paired with generated imagery.

This iteration introduces the Mastra agent on the ElysiaJS backend with a **Narrator** role,
wires in a `generate_image` tool that calls the It.02 Media Service, and exposes two transport
layers: a synchronous `POST /chat` REST endpoint and a streaming WebSocket `/ws` endpoint.

This gives the It.04 frontend a stable, tested API surface to connect to.

## Goals

- Initialise a Mastra agent on the backend with a Narrator system prompt defining its RPG storyteller role.
- Provide a `generate_image` tool the agent can call autonomously when it needs to illustrate a scene.
- Expose `POST /chat` so a caller can send a player message and receive a full narrative response.
- Expose `WebSocket /ws` so response tokens are streamed to the client in real time, with the
  generated image delivered at the end of the stream.
- Ship integration tests (Media Service mocked) that can be run with `bun test` to confirm
  correctness before the It.04 frontend is built.

## Constraints

- Must integrate with the It.02 Media Service API (`POST /generate/image`, `GET /jobs/{job_id}`)
  as implemented — no breaking changes to that API.
- Backend must remain on Bun + ElysiaJS; no new runtimes or agent frameworks beyond Mastra.

## User Stories

### US-001: Mastra agent initialised with Narrator system prompt

**As a** developer, **I want** a Mastra agent registered on the ElysiaJS backend with a Narrator
system prompt **so that** all subsequent player interactions are handled by a character-consistent
RPG storyteller.

**Acceptance Criteria:**
- [ ] A Mastra `Agent` instance is created in `apps/backend` with an `id` of `"narrator"`.
- [ ] The system prompt defines the agent as an imaginative RPG narrator that builds the world
  described by the player, narrates events in vivid prose, and decides when to generate imagery.
- [ ] The agent is accessible as a singleton (e.g. exported from `src/agent/narrator.ts`).
- [ ] The backend starts cleanly with `bun run dev` and logs confirm the agent is registered.
- [ ] Typecheck / lint passes.

---

### US-002: `generate_image` tool wired to Media Service

**As a** Mastra agent, **I want** a `generate_image` tool I can call with a text prompt **so that**
I can request scene images from the Media Service without hard-coding HTTP logic inside the agent.

**Acceptance Criteria:**
- [ ] A Mastra tool named `generate_image` is defined and registered on the Narrator agent.
- [ ] The tool accepts a single string parameter `prompt`.
- [ ] On invocation it calls `POST /generate/image` on the Media Service (URL from env var
  `MEDIA_SERVICE_URL`, defaulting to `http://localhost:8000`).
- [ ] It polls `GET /jobs/{job_id}` at a configurable interval (default 2 s) until the job
  status is `"done"` or `"failed"`.
- [ ] On `"done"` it returns the `image_b64` string to the agent.
- [ ] On `"failed"` it returns a structured error string: `"Image generation failed: <error message>"`.
- [ ] Poll timeout defaults to 120 s; exceeded polls return the same structured error.
- [ ] The tool is created via `createGenerateImageTool(client: MediaServiceClient)` factory;
  no `fetch` call appears directly inside the tool body.
- [ ] Typecheck / lint passes.

---

### US-003: `POST /chat` REST endpoint

**As a** developer, **I want** a `POST /chat` endpoint that runs a player message through the
Narrator agent and returns the full narrative response **so that** I can verify agent behaviour
without a WebSocket client.

**Acceptance Criteria:**
- [ ] `POST /chat` accepts JSON body `{ "message": "<player message>" }`.
- [ ] Response is HTTP 200 with body `{ "response": "<narrative text>", "images": ["<b64 or url>", …] }`.
  `images` is an empty array when no image was generated.
- [ ] Missing or empty `message` returns HTTP 400 with `{ "error": "message is required" }`.
- [ ] The endpoint calls the Narrator agent and awaits the full response before replying.
- [ ] If the agent invokes `generate_image`, the resulting `image_b64` is included in `images`.
- [ ] Errors from the agent (including tool failures) return HTTP 500 with
  `{ "error": "<message>" }` — no unhandled crashes.
- [ ] Typecheck / lint passes.

---

### US-004: WebSocket `/ws` streaming endpoint

**As a** developer (and future frontend), **I want** a WebSocket endpoint that streams Narrator
agent tokens as they are generated **so that** the UI can show text appearing progressively and
display the image at the end.

**Acceptance Criteria:**
- [ ] Connecting to `ws://localhost:<BACKEND_PORT>/ws` establishes a WebSocket session.
- [ ] Sending a JSON frame `{ "message": "<player message>" }` starts agent inference.
- [ ] Each text token is sent as a frame `{ "type": "token", "content": "<token>" }`.
- [ ] When a `generate_image` tool call completes, a frame
  `{ "type": "image", "image_b64": "<base64 PNG>" }` is sent.
- [ ] When the full response is complete, a frame `{ "type": "done" }` is sent.
- [ ] If an error occurs, a frame `{ "type": "error", "message": "<description>" }` is sent
  and the connection is kept open for the next message.
- [ ] Frames are valid JSON; malformed incoming frames are replied to with an `"error"` frame
  (connection not closed).
- [ ] Typecheck / lint passes.

---

### US-005: Integration tests

**As a** developer, **I want** integration tests covering the chat endpoint, WebSocket, and tool
flow (Media Service mocked) **so that** I can confirm correctness before building the frontend.

**Acceptance Criteria:**
- [ ] Tests live in `apps/backend/src/__tests__/` and run with `bun test`.
- [ ] `test_chat_endpoint.test.ts`: verifies HTTP 200 response with narrative text; verifies
  HTTP 400 on empty message; verifies that a triggered `generate_image` call populates `images`.
- [ ] `test_ws_endpoint.test.ts`: verifies token frames are received; verifies `"done"` frame
  is the last frame; verifies `"image"` frame appears when the tool is triggered.
- [ ] `test_generate_image_tool.test.ts`: verifies the tool polls until `"done"`, returns
  `image_b64`; verifies it returns a structured error on `"failed"` status; verifies timeout
  behaviour.
- [ ] The Media Service is mocked via a configurable HTTP client or test double — no real
  Media Service process required to run the tests.
- [ ] All tests pass with `bun test` from the repo root.
- [ ] Typecheck / lint passes.

---

## Functional Requirements

- **FR-1:** Mastra `Agent` with id `"narrator"` initialised at backend startup; system prompt
  defines an RPG narrator persona.
- **FR-2:** Mastra tool `generate_image(prompt: string)` registered on the Narrator agent;
  calls Media Service `POST /generate/image` → polls `GET /jobs/{job_id}` → returns `image_b64`
  or structured error.
- **FR-3:** `POST /chat` → HTTP 200 `{ response: string, images: string[] }` or
  HTTP 400/500 `{ error: string }`.
- **FR-4:** `WS /ws` frame protocol: `token | image | done | error` frame types; keeps
  connection alive across multiple messages.
- **FR-5:** Media Service base URL configured via env var `MEDIA_SERVICE_URL`
  (default `http://localhost:8000`); never hard-coded.
- **FR-6:** `generate_image` tool uses a poll interval of 2 s and a max wait of 120 s.
- **FR-7:** The `generate_image` tool must be created via a factory function that receives a
  `MediaServiceClient` interface — never importing or calling `fetch` directly inside the tool body.
  Required pattern:
  ```ts
  // apps/backend/src/tools/generate-image.ts
  export interface MediaServiceClient {
    submitJob(prompt: string): Promise<{ job_id: string }>;
    pollJob(jobId: string): Promise<{ status: string; result?: { image_b64: string }; error?: string }>;
  }

  export function createGenerateImageTool(client: MediaServiceClient) {
    return tool({ … });
  }

  // apps/backend/src/agent/narrator.ts
  const agent = new Agent({
    tools: { generateImage: createGenerateImageTool(new HttpMediaServiceClient()) },
  });

  // in tests
  const agent = new Agent({
    tools: { generateImage: createGenerateImageTool(mockClient) },
  });
  ```
  A global `fetch` mock or `vi.mock` / `jest.mock` at the module level is **not** an acceptable substitute.
- **FR-8:** No `console.log` in production code paths; use structured logging (ElysiaJS logger
  or equivalent).
- **FR-9:** Agent module lives in `apps/backend/src/agent/`; transport handlers (REST + WS)
  live in `apps/backend/src/routes/`.
- **FR-10:** All tests run via `bun test`; no extra test runner required.

## Non-Goals (Out of Scope)

- Persistent conversation history across sessions (deferred to a later iteration).
- Player world-definition flow / initial world setup prompt (deferred to It.04+).
- Frontend UI changes (deferred to It.04).
- Authentication or rate limiting on any endpoint.
- Video or audio generation tool calls (deferred to It.11–It.13).
- Redis-backed job store changes in the Media Service (deferred to It.06).
- Production deployment or containerisation.

## Open Questions

- None — all decisions resolved during requirement interview.
