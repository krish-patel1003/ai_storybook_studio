import asyncio
import json

from src.generation.constants import (
    GEMINI_PRO,
    PAGE_GEN_CONCURRENCY,
    TEMP_PAGES,
    WORD_LIMITS,
)
from src.generation.llm_client import LLMClient
from src.generation.prompts.system import PAGES
from src.generation.schemas import (
    CharacterSheet,
    GeneratedPage,
    StoryBeat,
    StoryBrief,
)


class PageStage:
    def __init__(self, client: LLMClient, model: str = GEMINI_PRO) -> None:
        self._client = client
        self._model = model
        self._sem = asyncio.Semaphore(PAGE_GEN_CONCURRENCY)

    async def run(
        self,
        brief: StoryBrief,
        characters: list[CharacterSheet],
        beats: list[StoryBeat],
        age_range: str,
        art_style: str,
    ) -> list[GeneratedPage]:
        char_map = {c.name: c for c in characters}
        ordered = sorted(beats, key=lambda b: b.order)
        word_min, word_max = WORD_LIMITS.get(age_range, (45, 70))

        tasks = [
            self._generate_page(
                beat=beat,
                brief=brief,
                char_map=char_map,
                all_beats=ordered,
                age_range=age_range,
                art_style=art_style,
                word_min=word_min,
                word_max=word_max,
            )
            for beat in ordered
        ]
        return await asyncio.gather(*tasks)

    async def _generate_page(
        self,
        *,
        beat: StoryBeat,
        brief: StoryBrief,
        char_map: dict[str, CharacterSheet],
        all_beats: list[StoryBeat],
        age_range: str,
        art_style: str,
        word_min: int,
        word_max: int,
    ) -> GeneratedPage:
        async with self._sem:
            prompt = _build_page_prompt(
                beat=beat,
                brief=brief,
                char_map=char_map,
                all_beats=all_beats,
                age_range=age_range,
                art_style=art_style,
                word_min=word_min,
                word_max=word_max,
            )
            system = _build_page_system(age_range, word_min, word_max)
            return await self._client.generate(
                prompt=prompt,
                schema=GeneratedPage,
                system=system,
                model=self._model,
                temperature=TEMP_PAGES,
            )


def _build_page_system(age_range: str, word_min: int, word_max: int) -> str:
    return (
        PAGES
        + f"\n\nWord limit for age range {age_range}: {word_min}–{word_max} words per page. "
        f"Do not exceed {word_max} words. Do not pad if the beat is naturally shorter than {word_min}."
    )


def _build_page_prompt(
    *,
    beat: StoryBeat,
    brief: StoryBrief,
    char_map: dict[str, CharacterSheet],
    all_beats: list[StoryBeat],
    age_range: str,
    art_style: str,
    word_min: int,
    word_max: int,
) -> str:
    anchor_lines = []
    for name in beat.characters_present:
        if char := char_map.get(name):
            anchors = ", ".join(char.visual_anchors)
            anchor_lines.append(f"  {name}: {anchors}")
    anchors_block = "\n".join(anchor_lines) if anchor_lines else "  (no named characters)"

    prev_context = ""
    if beat.order > 1:
        prev_beat = next((b for b in all_beats if b.order == beat.order - 1), None)
        if prev_beat:
            prev_context = (
                f"\nPrevious page beat (for prose continuity): \"{prev_beat.beat}\"\n"
            )

    return f"""\
Story brief (title + moral + world for prose consistency):
  Title: {brief.title}
  World: {brief.world}
  Moral (never state this directly): {brief.moral}

Character visual anchors for this page (inject ALL into assembled_prompt):
{anchors_block}

Art style: {art_style}

All beats (for narrative context — write only THIS page):
{json.dumps([b.model_dump() for b in all_beats], indent=2)}
{prev_context}
NOW WRITE PAGE {beat.order}:
  Beat: "{beat.beat}"
  Narrative role: {beat.narrative_role}
  Emotional note: {beat.emotional_note}
  Characters present: {", ".join(beat.characters_present) or "none"}
  Setting: {beat.setting_note}
  Is cover: {"yes — write title only, no body text" if beat.order == 0 else "no"}

Write the page text ({word_min}–{word_max} words) and full illustration_metadata.
The assembled_prompt in illustration_metadata must include the art style "{art_style}" \
and all visual anchors listed above.
"""
