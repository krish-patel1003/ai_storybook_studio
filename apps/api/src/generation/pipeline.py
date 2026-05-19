"""
StoryPipeline — orchestrates the five generation stages.

Accepts a ModelConfig that selects the provider (Gemini or Ollama) and the
specific model name. Provider-specific model routing (fast vs quality stages)
is handled here so stage modules stay provider-agnostic.
"""

from dataclasses import dataclass, field

from src.generation.constants import GEMINI_FLASH, GEMINI_PRO
from src.generation.gemini import GeminiClient
from src.generation.llm_client import LLMClient
from src.generation.ollama_client import OllamaClient
from src.generation.schemas import (
    CharacterSheet,
    GeneratedPage,
    RecalibratedOutline,
    StoryBeat,
    StoryBrief,
)
from src.generation.stages.characters import CharacterStage
from src.generation.stages.enhance import EnhanceStage
from src.generation.stages.image import GeneratedImage, ImageStage
from src.generation.stages.outline import OutlineStage
from src.generation.stages.pages import PageStage
from src.generation.stages.recalibrate import RecalibrateStage


@dataclass
class ModelConfig:
    """
    Describes which AI provider and model to use.

    provider: "gemini" | "ollama"
    model_name:
      Gemini — "gemini-2.0-flash" | "gemini-1.5-pro"
      Ollama — any model tag pulled locally, e.g. "llama3.2", "mistral"
    """
    provider: str = "gemini"
    model_name: str = GEMINI_FLASH


@dataclass
class GenerationResult:
    brief: StoryBrief
    characters: list[CharacterSheet]
    beats: list[StoryBeat]
    pages: list[GeneratedPage]


def _build_stages(
    config: ModelConfig,
    api_key: str,
    ollama_base_url: str,
) -> tuple[LLMClient, str, str]:
    """
    Returns (client, fast_model, quality_model).

    Gemini: fast stages use Flash, quality stages use Pro (or both override
    if the user explicitly picked one tier).
    Ollama: same model for every stage.
    """
    if config.provider == "ollama":
        client: LLMClient = OllamaClient(base_url=ollama_base_url)
        return client, config.model_name, config.model_name

    # Gemini
    client = GeminiClient(api_key=api_key)
    if config.model_name == GEMINI_PRO:
        return client, GEMINI_PRO, GEMINI_PRO
    # Default / Flash: fast=Flash, quality=Pro
    return client, GEMINI_FLASH, GEMINI_PRO


class StoryPipeline:
    def __init__(
        self,
        api_key: str,
        ollama_base_url: str = "http://localhost:11434",
        model_config: ModelConfig | None = None,
    ) -> None:
        cfg = model_config or ModelConfig()
        client, fast, quality = _build_stages(cfg, api_key, ollama_base_url)
        self._api_key = api_key

        self._enhance = EnhanceStage(client, model=fast)
        self._characters = CharacterStage(client, model=quality)
        self._outline = OutlineStage(client, model=fast)
        self._pages = PageStage(client, model=quality)
        self._recalibrate = RecalibrateStage(client, model=fast)
        self._image = ImageStage(api_key=api_key)

    async def generate(
        self,
        *,
        raw_prompt: str,
        age_range: str,
        tone: list[str],
        art_style: str,
        safety: bool,
        page_count: int,
    ) -> GenerationResult:
        brief = await self._enhance.run(
            raw_prompt=raw_prompt,
            age_range=age_range,
            tone=tone,
            safety=safety,
            page_count=page_count,
        )
        characters = await self._characters.run(brief=brief, art_style=art_style)
        beats = await self._outline.run(
            brief=brief, characters=characters, page_count=page_count
        )
        pages = await self._pages.run(
            brief=brief,
            characters=characters,
            beats=beats,
            age_range=age_range,
            art_style=art_style,
        )
        return GenerationResult(
            brief=brief,
            characters=characters,
            beats=beats,
            pages=sorted(pages, key=lambda p: p.order),
        )

    async def recalibrate(
        self,
        *,
        brief: StoryBrief,
        current_beats: list[StoryBeat],
        new_page_count: int,
        locked_orders: set[int],
    ) -> RecalibratedOutline:
        return await self._recalibrate.run(
            brief=brief,
            current_beats=current_beats,
            new_page_count=new_page_count,
            locked_orders=locked_orders,
        )

    async def illustrate(
        self,
        *,
        pages: list,
        visual_seed: int,
    ) -> list[GeneratedImage]:
        """Generate illustrations for all pages that have illustration_metadata."""
        return await self._image.run(pages=pages, visual_seed=visual_seed)

    async def illustrate_single(
        self,
        *,
        page,
        visual_seed: int,
    ) -> GeneratedImage:
        results = await self._image.run(pages=[page], visual_seed=visual_seed)
        return results[0]

    async def regenerate_pages(
        self,
        *,
        brief: StoryBrief,
        characters: list[CharacterSheet],
        beats: list[StoryBeat],
        age_range: str,
        art_style: str,
        orders: set[int] | None = None,
    ) -> list[GeneratedPage]:
        target_beats = (
            [b for b in beats if b.order in orders] if orders else beats
        )
        return await self._pages.run(
            brief=brief,
            characters=characters,
            beats=target_beats,
            age_range=age_range,
            art_style=art_style,
        )
