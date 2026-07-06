"""
ImageStage — generates one illustration per page using Gemini image generation.

Seed strategy: visual_seed (stored on Book) + page.order → each page gets a
deterministic, reproducible seed.

When character_refs are provided (dict of name→image bytes), they are prepended
to the prompt as visual anchors so Gemini keeps character appearance consistent.
"""
import asyncio
import base64
import logging
from dataclasses import dataclass

from google import genai
from google.genai import types as gtypes

logger = logging.getLogger(__name__)

# Global semaphore — shared across ALL pipeline instances and HTTP requests so
# concurrent illustrate calls from the frontend cannot stampede the Gemini API.
# With per-instance semaphores each new _pipeline() call got its own gate,
# making the limit meaningless when multiple requests arrived at once.
IMAGE_CONCURRENCY = 2
_global_sem = asyncio.Semaphore(IMAGE_CONCURRENCY)


@dataclass
class GeneratedImage:
    order: int
    image_data: bytes
    mime_type: str


class ImageStage:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash-image") -> None:
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._sem = _global_sem  # shared, not per-instance

    async def run(
        self,
        pages: list,
        visual_seed: int,
        character_refs: dict[str, bytes] | None = None,
        max_retries: int = 3,
    ) -> list[GeneratedImage]:
        tasks = [
            self._generate_one(
                page=p,
                visual_seed=visual_seed,
                character_refs=character_refs or {},
                max_retries=max_retries,
            )
            for p in pages
            if p.illustration_metadata is not None
        ]
        return await asyncio.gather(*tasks)

    async def _generate_one(
        self,
        *,
        page,
        visual_seed: int,
        character_refs: dict[str, bytes],
        max_retries: int,
    ) -> GeneratedImage:
        async with self._sem:
            meta = page.illustration_metadata
            assembled = meta.get("assembled_prompt", "") if isinstance(meta, dict) else ""
            negative = meta.get("negative_prompt", "") if isinstance(meta, dict) else ""

            prompt_text = assembled
            if negative:
                prompt_text += f"\n\nAvoid: {negative}"

            # Build multimodal content list when character refs are available
            present = page.characters_present or []
            page_refs = {name: data for name, data in character_refs.items() if name in present}

            if page_refs:
                contents: list = [
                    "These are the character reference images. "
                    "Maintain their exact visual appearance — same colors, proportions, clothing, and facial features — in the illustration:\n"
                ]
                for img_bytes in page_refs.values():
                    contents.append(
                        gtypes.Part.from_bytes(data=img_bytes, mime_type="image/png")
                    )
                contents.append(
                    f"\n\nNow generate this children's picture book illustration:\n{prompt_text}"
                )
            else:
                contents = prompt_text

            seed = (visual_seed + page.order) % (2**31)

            last_exc: Exception | None = None
            for attempt in range(max_retries):
                try:
                    response = await self._client.aio.models.generate_content(
                        model=self._model,
                        contents=contents,
                        config=gtypes.GenerateContentConfig(
                            response_modalities=["IMAGE"],
                            seed=seed,
                        ),
                    )
                    for part in response.candidates[0].content.parts:
                        if part.inline_data and part.inline_data.data:
                            raw = part.inline_data.data
                            image_bytes = base64.b64decode(raw) if isinstance(raw, str) else raw
                            return GeneratedImage(
                                order=page.order,
                                image_data=image_bytes,
                                mime_type=part.inline_data.mime_type or "image/png",
                            )
                    raise ValueError(f"No image data in Gemini response for page {page.order}")
                except Exception as exc:
                    last_exc = exc
                    if attempt < max_retries - 1:
                        wait = 2**attempt
                        logger.warning(
                            "Image generation attempt %d/%d failed for page %d (%s), retrying in %ds",
                            attempt + 1, max_retries, page.order, exc, wait,
                        )
                        await asyncio.sleep(wait)
            raise RuntimeError(
                f"Image generation failed for page {page.order} after {max_retries} attempts"
            ) from last_exc
