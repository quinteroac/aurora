# Agent instructions — Aurora

Guidance for AI agents and contributors working on this repository.

## Project

Agentic RPG where the player defines the universe and an LLM agent builds, inhabits, and narrates it in real time — with images, video, music, and SFX generated on the fly.

See [ROADMAP.md](./ROADMAP.md) for the full development plan (22 iterations across 6 phases).

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | [React](https://react.dev) + [R3F](https://docs.pmnd.rs/react-three-fiber) + [assistant-ui](https://www.assistant-ui.com/docs) |
| Backend | [ElysiaJS](https://elysiajs.com/introduction) + [Bun](https://bun.sh/docs) |
| Agent Framework | [Mastra](https://mastra.ai/en/docs) (TypeScript) |
| Media Service | [FastAPI](https://fastapi.tiangolo.com) + [comfy-diffusion](https://github.com/quinteroac/comfy-diffusion) |
| Persistence | [PostgreSQL](https://www.postgresql.org/docs/) + [pgvector](https://github.com/pgvector/pgvector) + [Redis](https://redis.io/docs/) via [Podman](https://docs.podman.io) |
| LLM | [OpenAI API](https://platform.openai.com/docs) / [Anthropic API](https://docs.anthropic.com) (interchangeable) |
| Image models | [SDXL](https://stability.ai/stable-diffusion) + [Flux Kontext](https://blackforestlabs.ai) / [Qwen Edit](https://huggingface.co/Qwen) |
| Video models | [WAN 2.1](https://github.com/Wan-Video/Wan2.1) · [LTXV](https://github.com/Lightricks/LTX-Video) |
| Audio models | [ACE Step](https://github.com/ace-step/ACE-Step) · [Qwen TTS](https://huggingface.co/Qwen) |

---

## Bundled skills (discoverable at runtime)

`comfy_diffusion` ships distributable skill documents inside the installed package under
`comfy_diffusion/skills/` (this is separate from repo-local `.agents/skills/`).

To discover them at runtime:

```python
from comfy_diffusion.skills import get_skills_path

skills_root = get_skills_path()

---

## Assets language

**All assets must be created in English.**

