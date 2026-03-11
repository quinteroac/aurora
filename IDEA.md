Aurora is an agentic RPG game with support for:

- Roleplaying via text or voice chat with one or more characters.
- Main character design + NPCs.
- Generating images, video, music, and sound effects.
- An interactive, dynamic game interface that adapts to what happens during the session.

Aurora’s architecture relies on:

- An LLM with agentic capabilities (SKILLS, TOOLS, and MCP) (OpenAI-compatible, Anthropic-compatible).
- Image, video, music, and sound generation via ComfyUI using the comfy-diffusion library (https://pypi.org/project/comfy-diffusion/) through an ElysiaJS (Bun) API ←→ HTTP ←→ FastAPI/Flask (Python + comfy-diffusion).
- An interactive, dynamic frontend with R3F and WebGL that can react to in-game events (explosions, magic, dynamic zooms, etc.).
- Chat/voice interface using https://www.assistant-ui.com/.
