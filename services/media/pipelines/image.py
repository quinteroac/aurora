from __future__ import annotations

import base64
import importlib
import io
import logging
import os

logger = logging.getLogger("aurora.media.pipeline")

DEFAULT_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x04\x00\x00\x00\xb5\x1c\x0c\x02\x00\x00\x00\x0bIDATx\xdac\xfc"
    b"\xff\x1f\x00\x03\x03\x02\x00\xee\x97\xde*\x00\x00\x00\x00IEND\xaeB`\x82"
)


class IllustriousPipeline:
    """comfy-diffusion Illustrious (SDXL) text-to-image pipeline.

    Instantiated once at startup and registered on ``app.state.pipeline`` so
    that routers and workers never import it directly — making it trivially
    replaceable with a mock in tests without monkeypatching imports.

    Uses the confirmed comfy-diffusion API signatures from SKILL.md:
      - ModelManager / CheckpointResult  (comfy_diffusion.models)
      - encode_prompt                     (comfy_diffusion.conditioning)
      - empty_latent_image                (comfy_diffusion.latent)
      - sample                            (comfy_diffusion.sampling)
      - vae_decode → PIL.Image            (comfy_diffusion.vae)
    """

    def __init__(self, models_dir: str | None = None) -> None:
        self._models_dir = models_dir or os.environ.get("MODELS_DIR", "models")

    def __call__(self, prompt: str) -> dict[str, str]:
        importlib.import_module("comfy_diffusion").check_runtime()

        models_mod = importlib.import_module("comfy_diffusion.models")
        conditioning_mod = importlib.import_module("comfy_diffusion.conditioning")
        latent_mod = importlib.import_module("comfy_diffusion.latent")
        lora_mod = importlib.import_module("comfy_diffusion.lora")
        sampling_mod = importlib.import_module("comfy_diffusion.sampling")
        vae_mod = importlib.import_module("comfy_diffusion.vae")

        mgr = models_mod.ModelManager(self._models_dir)
        ckpt = mgr.load_checkpoint(os.environ.get("CHECKPOINT", "illustrious_xl.safetensors"))

        lora_path = os.environ.get("LORA")
        if lora_path and lora_path.strip():
            ckpt.model, ckpt.clip = lora_mod.apply_lora(
                ckpt.model,
                ckpt.clip,
                lora_path.strip(),
                strength_model=1.0,
                strength_clip=1.0,
            )

        positive = conditioning_mod.encode_prompt(ckpt.clip, prompt)
        negative = conditioning_mod.encode_prompt(ckpt.clip, "")

        latent = latent_mod.empty_latent_image(width=1024, height=1024, batch_size=1)

        denoised = sampling_mod.sample(
            ckpt.model,
            positive,
            negative,
            latent,
            steps=8,
            cfg=1.0,
            sampler_name="dpmpp_2m",
            scheduler="karras",
            seed=42,
            denoise=1.0,
        )

        image = vae_mod.vae_decode(ckpt.vae, denoised)

        buf = io.BytesIO()
        image.save(buf, format="PNG")
        return {"image_b64": base64.b64encode(buf.getvalue()).decode("ascii")}
