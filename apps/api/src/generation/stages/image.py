"""
ImageStage — generates one illustration per page using Gemini image generation.

Seed strategy: visual_seed (stored on Book) + page.order → each page gets a
deterministic, reproducible seed. Same seed = same composition, so characters
stay visually consistent if you regenerate with the same prompt.
"""

import asyncio
import base64
import logging
from dataclasses import dataclass

from google import genai
from google.genai import types as gtypes

logger = logging.getLogger(__name__)

IMAGE_CONCURRENCY = 3  # max parallel Gemini image calls


@dataclass
class GeneratedImage:
    order: int
    image_data: bytes
    mime_type: str


class ImageStage:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash-image") -> None:
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._sem = asyncio.Semaphore(IMAGE_CONCURRENCY)

    async def run(
        self,
        pages: list,
        visual_seed: int,
        max_retries: int = 3,
    ) -> list[GeneratedImage]:
        """Generate images for all pages concurrently."""
        tasks = [
            self._generate_one(page=p, visual_seed=visual_seed, max_retries=max_retries)
            for p in pages
            if p.illustration_metadata is not None
        ]
        return await asyncio.gather(*tasks)

    async def _generate_one(self, *, page, visual_seed: int, max_retries: int) -> GeneratedImage:
        async with self._sem:
            meta = page.illustration_metadata
            assembled = meta.get("assembled_prompt", "") if isinstance(meta, dict) else ""
            negative = meta.get("negative_prompt", "") if isinstance(meta, dict) else ""

            # Combine prompt — negative as a suffix instruction
            prompt = assembled
            if negative:
                prompt += f"\n\nAvoid: {negative}"

            # Per-page seed: book seed + page order = reproducible per composition
            seed = (visual_seed + page.order) % (2**31)

            last_exc: Exception | None = None
            for attempt in range(max_retries):
                try:
                    response = await self._client.aio.models.generate_content(
                        model=self._model,
                        contents=prompt,
                        config=gtypes.GenerateContentConfig(
                            response_modalities=["IMAGE"],
                            seed=seed,
                        ),
                    )

                    for part in response.candidates[0].content.parts:
                        if part.inline_data and part.inline_data.data:
                            raw = part.inline_data.data
                            # SDK may return already-decoded bytes or base64 string
                            image_bytes = (
                                base64.b64decode(raw) if isinstance(raw, str) else raw
                            )
                            return GeneratedImage(
                                order=page.order,
                                image_data=image_bytes,
                                mime_type=part.inline_data.mime_type or "image/png",
                            )

                    raise ValueError(f"No image data in Gemini response for page {page.order}")

                except Exception as exc:
                    last_exc = exc
                    if attempt < max_retries - 1:
                        wait = 2 ** attempt
                        logger.warning(
                            "Image generation attempt %d/%d failed for page %d (%s), retrying in %ds",
                            attempt + 1, max_retries, page.order, exc, wait,
                        )
                        await asyncio.sleep(wait)

            raise RuntimeError(
                f"Image generation failed for page {page.order} after {max_retries} attempts"
            ) from last_exc
