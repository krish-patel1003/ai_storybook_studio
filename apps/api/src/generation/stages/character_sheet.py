"""
CharacterSheetStage — generates one reference image per character.

Stored in MinIO and passed as visual anchors when illustrating each page,
giving the model pixel-level character consistency instead of text-only descriptions.
"""
import asyncio
import base64
import logging
from dataclasses import dataclass

from google import genai
from google.genai import types as gtypes

logger = logging.getLogger(__name__)


@dataclass
class GeneratedCharacterSheet:
    character_id: str
    image_data: bytes
    mime_type: str


class CharacterSheetStage:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash-image") -> None:
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._sem = asyncio.Semaphore(2)

    async def run(
        self, characters: list, art_style: str, visual_seed: int
    ) -> list[GeneratedCharacterSheet]:
        tasks = [
            self._generate_one(character=c, art_style=art_style, visual_seed=visual_seed)
            for c in characters
        ]
        return await asyncio.gather(*tasks)

    async def _generate_one(
        self, *, character, art_style: str, visual_seed: int, max_retries: int = 3
    ) -> GeneratedCharacterSheet:
        async with self._sem:
            anchors = ", ".join(character.visual_anchors) if character.visual_anchors else ""
            prompt = (
                f"Character reference sheet for a children's picture book.\n\n"
                f"Character: {character.name}\n"
                f"Description: {character.illustration_prompt}\n"
                f"Visual anchors: {anchors}\n"
                f"Art style: {art_style}\n\n"
                f"Draw the character in a clean full-body neutral standing pose on a plain white background. "
                f"Show all visual details clearly — face, expression, clothing, colors, proportions. "
                f"No scene, no props, no other characters. "
                f"This image will be used as a reference to keep this character visually identical across all story illustrations."
            )
            seed = visual_seed % (2**31)

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
                            image_bytes = base64.b64decode(raw) if isinstance(raw, str) else raw
                            return GeneratedCharacterSheet(
                                character_id=str(character.id),
                                image_data=image_bytes,
                                mime_type=part.inline_data.mime_type or "image/png",
                            )
                    raise ValueError(f"No image in response for character {character.name}")
                except Exception as exc:
                    last_exc = exc
                    if attempt < max_retries - 1:
                        wait = 2**attempt
                        logger.warning(
                            "Character sheet attempt %d/%d failed for %s: %s, retrying in %ds",
                            attempt + 1, max_retries, character.name, exc, wait,
                        )
                        await asyncio.sleep(wait)
            raise RuntimeError(
                f"Character sheet generation failed for {character.name} after {max_retries} attempts"
            ) from last_exc
