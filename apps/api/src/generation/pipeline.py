"""
StoryPipeline — orchestrates the four generation stages.

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
    PagePlan,
    RecalibratedOutline,
    StoryBeat,
    StoryBrief,
)
from src.generation.stages.brief import BriefStage
from src.generation.stages.character_sheet import CharacterSheetStage, GeneratedCharacterSheet
from src.generation.stages.enhance import EnhanceStage
from src.generation.stages.expand import BrainstormStage, ExpandStage
from src.generation.stages.image import GeneratedImage, ImageStage
from src.generation.stages.pages import PageStage
from src.generation.stages.recalibrate import RecalibrateStage
from src.generation.stages.review_loop import ReviewLoopStage


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


def _apply_arc_headings(pages: list[PagePlan], brief: StoryBrief) -> None:
    """Overwrite each content page's narrative_role with its arc stage name.

    The arc defines named sections (e.g. "A Big Summer Plan") each spanning a
    number of pages (page_span). Content pages (order > 0) are assigned in order;
    any overflow pages added for requirements inherit the last stage's name.
    """
    if not brief.arc:
        return
    content = sorted((p for p in pages if p.order > 0), key=lambda p: p.order)
    idx = 0
    for stage in brief.arc:
        for _ in range(stage.page_span):
            if idx < len(content):
                content[idx].narrative_role = stage.name
            idx += 1
    last_name = brief.arc[-1].name
    while idx < len(content):
        content[idx].narrative_role = last_name
        idx += 1


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

        self._brainstorm = BrainstormStage(client, model=fast)
        self._expand = ExpandStage(client, model=fast)
        self._enhance = EnhanceStage(client, model=fast)
        self._brief = BriefStage(client, model=fast)
        self._pages = PageStage(client, model=quality)
        self._review_loop = ReviewLoopStage(client, model=fast)
        self._recalibrate = RecalibrateStage(client, model=fast)
        self._image = ImageStage(api_key=api_key)
        self._char_sheet = CharacterSheetStage(api_key=api_key)

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
        # Stage 1: Enhance prompt + extract requirements
        brief = await self._enhance.run(
            raw_prompt=raw_prompt,
            age_range=age_range,
            tone=tone,
            safety=safety,
            page_count=page_count,
        )

        # Stage 2: Write story plan (characters + page-by-page plan)
        plan = await self._brief.run(
            brief=brief,
            page_count=page_count,
            art_style=art_style,
        )

        # Replace LLM-generated structural labels with the human-readable arc stage
        # names from the story brief so they show as chapter headings on each page.
        _apply_arc_headings(plan.pages, brief)

        # Map PagePlan → StoryBeat for GenerationResult compatibility
        beats = [
            StoryBeat(
                order=p.order,
                narrative_role=p.narrative_role,
                beat=p.summary,
                emotional_note=p.emotional_note,
                characters_present=p.characters_present,
                setting_note=p.setting,
            )
            for p in plan.pages
        ]

        # Stage 3: Write pages from the plan
        pages = await self._pages.run(
            brief=brief,
            characters=plan.characters,
            plans=plan.pages,
            age_range=age_range,
            art_style=art_style,
        )

        # Stage 4: Score + iterative rewrite loop
        pages = await self._review_loop.run(
            pages=pages,
            brief=brief,
            age_range=age_range,
        )

        return GenerationResult(
            brief=brief,
            characters=plan.characters,
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

    async def generate_character_sheets(
        self,
        *,
        characters: list,
        art_style: str,
        visual_seed: int,
    ) -> list[GeneratedCharacterSheet]:
        return await self._char_sheet.run(
            characters=characters,
            art_style=art_style,
            visual_seed=visual_seed,
        )

    async def illustrate(
        self,
        *,
        pages: list,
        visual_seed: int,
        character_refs: dict[str, bytes] | None = None,
    ) -> list[GeneratedImage]:
        """Generate illustrations for all pages that have illustration_metadata."""
        return await self._image.run(pages=pages, visual_seed=visual_seed, character_refs=character_refs)

    async def illustrate_single(
        self,
        *,
        page,
        visual_seed: int,
        character_refs: dict[str, bytes] | None = None,
    ) -> GeneratedImage:
        results = await self._image.run(
            pages=[page], visual_seed=visual_seed, character_refs=character_refs
        )
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
        from src.generation.schemas import PagePlan
        target_beats = (
            [b for b in beats if b.order in orders] if orders else beats
        )
        # Convert StoryBeat → PagePlan for the simplified PageStage
        plans = [
            PagePlan(
                order=b.order,
                narrative_role=b.narrative_role,
                summary=b.beat,
                emotional_note=b.emotional_note,
                characters_present=b.characters_present,
                setting=b.setting_note,
            )
            for b in target_beats
        ]
        pages = await self._pages.run(
            brief=brief,
            characters=characters,
            plans=plans,
            age_range=age_range,
            art_style=art_style,
        )
        return await self._review_loop.run(pages=pages, brief=brief, age_range=age_range)
