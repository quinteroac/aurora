# Aurora

> An agentic RPG where you define the universe — the LLM agent builds it, inhabits it, and narrates it in real time.

Aurora is a generative role-playing game with no fixed story. Every playthrough is unique, constructed entirely by an AI agent from the player's initial setting. NPCs have personality, persistent memory, and their own voice. The world reacts visually with images, video, music, and sound effects generated in real time as the narrative unfolds.

---

## Product Pillars

| Pillar | Description |
|---|---|
| **Generative narrative** | Player defines the setting; the agent builds the world, story, and characters |
| **Deep NPCs** | Unique personality, persistent memory, and voice per character |
| **Real-time media** | Images, video, music, SFX, and voice generated automatically by the agent |
| **Reactive interface** | WebGL/R3F frontend that responds dynamically to game events |
| **Multimodal** | Interchangeable text and voice interaction |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   CLIENT (Browser)                   │
│                                                     │
│  ┌──────────────────┐    ┌───────────────────────┐  │
│  │  Chat / Voice UI │    │   R3F / WebGL Canvas  │  │
│  │  assistant-ui    │    │   Reactive interface  │  │
│  └────────┬─────────┘    └───────────┬───────────┘  │
│           │ WebSocket                │ Events        │
└───────────┼──────────────────────────┼──────────────┘
            │                          │
┌───────────▼──────────────────────────▼──────────────┐
│           BACKEND (ElysiaJS / Bun)                   │
│                                                     │
│   API Gateway — Auth · Rate limiting · WebSockets   │
│                                                     │
│   Mastra Agent                                      │
│   · Narrator · NPCs · Art Director                  │
│   · Game state · Memory (MCP)                       │
│   · Tools: generate_*, search_assets, trigger_ui_*  │
└───────────┬──────────────────────────────────────────┘
            │ HTTP
┌───────────▼──────────────────────────────────────────┐
│           MEDIA SERVICE (Python / FastAPI)           │
│                                                     │
│   comfy-diffusion                                   │
│   · Image gen (SDXL onboarding / Flux Kontext)      │
│   · Video gen (WAN 2.1 / LTXV)                      │
│   · Music gen (ACE Step 1.5)                        │
│   · SFX gen · Voice TTS (Qwen TTS)                  │
└───────────┬──────────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────────┐
│                 PERSISTENCE LAYER                     │
│   Game state · NPC memory · World state              │
│   Asset Store (vectorial) · Object Storage           │
│   (PostgreSQL + pgvector + Redis + S3-compatible)    │
└──────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | [React](https://react.dev) + [R3F](https://docs.pmnd.rs/react-three-fiber) (Three.js) + [assistant-ui](https://www.assistant-ui.com/docs) |
| Backend | [ElysiaJS](https://elysiajs.com/introduction) + [Bun](https://bun.sh/docs) |
| Agent Framework | [Mastra](https://mastra.ai/en/docs) (TypeScript) |
| Media Service | [Python](https://docs.python.org/3/) + [FastAPI](https://fastapi.tiangolo.com) + [comfy-diffusion](https://github.com/quinteroac/comfy-diffusion) |
| Persistence | [PostgreSQL](https://www.postgresql.org/docs/) + [pgvector](https://github.com/pgvector/pgvector) + [Redis](https://redis.io/docs/) via [Podman](https://docs.podman.io) |
| LLM | [OpenAI API](https://platform.openai.com/docs) / [Anthropic API](https://docs.anthropic.com) (interchangeable) |
| Image models | [SDXL](https://stability.ai/stable-diffusion) + [Flux Kontext](https://blackforestlabs.ai) / [Qwen Edit](https://huggingface.co/Qwen) |
| Video models | [WAN 2.1](https://github.com/Wan-Video/Wan2.1) · [LTXV](https://github.com/Lightricks/LTX-Video) |
| Audio models | [ACE Step](https://github.com/ace-step/ACE-Step) · [Qwen TTS](https://huggingface.co/Qwen) |

---

## LLM Agent Layer

Aurora uses **Mastra** (TypeScript) as the agent framework, running in the same Bun process as the API Gateway. A **single agent with multiple tools/skills** — not multiple specialized LLMs. The agent assumes different roles through dynamic system prompts and context switching.

### Agent Roles

| Role | Responsibility |
|---|---|
| **Narrator** | Builds the story, describes scenes, manages narrative flow |
| **NPC** | Embodies characters with individual personality and memory |
| **Art Director** | Decides what media to generate, when, and with what parameters |
| **Game Master** | Evaluates player actions, applies world rules, resolves conflicts |

### Agent Tools

#### Real-time media generation
| Tool | Description |
|---|---|
| `generate_image` | Generates scene or character image — only if no appropriate asset exists |
| `generate_video` | Generates cinematic or short animation — only if no appropriate asset exists |
| `generate_music` | Generates adaptive soundtrack matching the scene mood |
| `generate_sfx` | Generates contextual sound effect |
| `generate_voice` | Generates active NPC voice (Qwen TTS) |

#### Asset library
| Tool | Description |
|---|---|
| `generate_asset` | Generates and catalogs an asset of any type with metadata (type, emotion, scene, character, tags) |
| `search_assets` | Searches assets by semantic metadata — "angry NPC", "tense battle music", "SFX rain" |
| `compose_scene` | Combines existing assets to build a scene without regenerating |

#### Game state
| Tool | Description |
|---|---|
| `update_game_state` | Updates game state (inventory, quests, map) |
| `recall_memory` | Retrieves NPC or past event memory (MCP) |
| `trigger_ui_event` | Fires visual effect on the frontend (explosion, zoom, etc.) |

### Media decision flow

The agent follows this flow before generating any visual or audio asset:

```
Does an appropriate asset exist in the library?
  ├── Yes → search_assets → compose_scene / use directly
  └── No  → generate_* → generate_asset (catalog for future use)
```

---

## Media Layer (comfy-diffusion)

All media generation runs on **comfy-diffusion** as a Python library — no ComfyUI server or node system.

| Media Type | Model | comfy-diffusion module |
|---|---|---|
| Images (characters, scenes) | Flux / SDXL | `sampling`, `conditioning`, `vae` |
| Video (cinematics, actions) | WAN 2.1 / LTXV | `conditioning.wan_*`, `conditioning.ltxv_*` |
| Adaptive music | ACE Step 1.5 | `audio.encode_ace_step_15_audio` |
| Sound effects | ACE Step 1.5 | `audio` |
| NPC voice | Qwen TTS | `audio` (future) |

### Character visual consistency

**Onboarding mode — Character creation**
SDXL + IP-Adapter generates the canonical reference image. The player describes or customizes their character; the base image is generated and persisted in the Asset Store as a permanent reference.

**Gameplay mode — In-game usage**
Flux Kontext / Qwen Edit receives the canonical reference image and generates new scenes, expressions, and situations while automatically maintaining character identity. No LoRAs, no retraining.

| Strategy | Usage | Model |
|---|---|---|
| **Edit model** (primary) | All gameplay scenes with character present | Flux Kontext, Qwen Edit |
| **LoRA** (fallback) | Highly stylized characters or when edit model unavailable | LoRA generated at onboarding |

---

## Frontend (R3F + WebGL)

The interface is reactive and dynamic — not a static chat with attached images. The canvas responds to game events in real time.

### Main Components

| Component | Description |
|---|---|
| **Chat / Voice** | `assistant-ui` — text/voice conversation interface |
| **Scene Viewer** | R3F canvas showing the current scene image/video |
| **Effects Layer** | Reactive WebGL effects (magic particles, explosions, fog, rain) |
| **HUD** | Inventory, character stats, active quests — updates with game state |
| **NPC Portrait** | Animated portrait of the active NPC with basic lip-sync |

### UI Events triggered by the agent

| Event | Visual effect |
|---|---|
| `combat_start` | Screen shake + combat music |
| `spell_cast` | Magic particles on the canvas |
| `explosion` | Flash + particles + SFX |
| `scene_change` | Crossfade + new scene image |
| `cinematic` | Full-screen video |
| `ambient_change` | Music change + ambient effects |

---

## RPG Elements

| Element | Description |
|---|---|
| **Player character** | Appearance generated at onboarding, persisted as visual reference |
| **NPCs** | Personality, backstory, motivations, and persistent memory across sessions |
| **Inventory** | Item system with agent-generated images |
| **Quests** | Objectives created dynamically by the agent according to the narrative |
| **Map** | Visual representation of the world generated progressively |
| **Combat** | Conflict resolution system integrated into the narrative |

---

## Development Phases

### Phase 1 — Core Loop
Narrator agent + text chat + scene image generation. No voice, no video, no effects. The basic loop: player describes setting → agent builds world → narrative with images.

### Phase 2 — Deep NPCs ⭐ MVP
NPC personality and persistent memory. Multiple characters in scene. Basic inventory and quest system.

### Phase 3 — Full Media
Cinematic video at key moments. Adaptive music. Contextual SFX. NPC voice with Qwen TTS.

### Phase 4 — Reactive Frontend
R3F interface with WebGL effects. Dynamic HUD. Navigable map. Visual combat system.

### Phase 5 — Player Voice
Voice input interchangeable with text. Basic lip-sync on NPC portraits.

### Phase 6 — Polish & Scalability
Character visual consistency via LoRA. Latency optimization. Multi-session. Polished onboarding.

---

## Key Architectural Decisions

- **Single agent, not multi-agent** — operational simplicity, one conversation context, less coordination latency
- **Media Service separate from Agent Service** — the agent does not block waiting for generation; media requests go to a queue and results arrive via WebSocket
- **comfy-diffusion as a library, not a ComfyUI server** — full pipeline control, no node system overhead, testable in CI
- **ElysiaJS as gateway, not app server** — Bun handles WebSockets and streaming efficiently; heavy logic lives in Python
- **Interchangeable LLM** — agent logic is not coupled to any specific provider
- **Persistence via Podman** — PostgreSQL + pgvector and Redis run as Podman containers; app stack (backend, frontend, media) runs via Bun
