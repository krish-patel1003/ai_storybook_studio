import asyncio
import json
import re

from src.generation.constants import (
    GEMINI_PRO,
    PAGE_GEN_CONCURRENCY,
    PAGE_SPLIT_THRESHOLD,
    TEMP_PAGES,
    WORD_LIMITS,
)
from src.generation.llm_client import LLMClient
from src.generation.prompts.system import PAGES, _AGE_VOICE
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
            page = await self._client.generate(
                prompt=prompt,
                schema=GeneratedPage,
                system=system,
                model=self._model,
                temperature=TEMP_PAGES,
            )
            # Humanise: strip AI punctuation tells before any further processing.
            if not page.is_cover and page.text:
                page = page.model_copy(update={"text": _humanize_text(page.text)})

            # Hard guard: trim only if the page is not a split candidate.
            # If word_count >= PAGE_SPLIT_THRESHOLD the service layer will split
            # the text into two pages — trimming here would destroy the second half.
            split_threshold = PAGE_SPLIT_THRESHOLD.get(age_range, 9999)
            if not page.is_cover and page.text:
                words = page.text.split()
                if len(words) > word_max and len(words) < split_threshold:
                    # Too long for one page but not long enough to warrant a split —
                    # trim to word_max at a sentence boundary.
                    trimmed = " ".join(words[:word_max])
                    for end in (".", "!", "?"):
                        idx = trimmed.rfind(end)
                        if idx > len(trimmed) // 2:
                            trimmed = trimmed[: idx + 1]
                            break
                    page = page.model_copy(update={"text": trimmed, "word_count": len(trimmed.split())})
            return page


def _build_page_system(age_range: str, word_min: int, word_max: int) -> str:
    voice = _AGE_VOICE.get(age_range, "")
    return (
        PAGES
        + f"\n\n{voice}"
        + f"\nWORD COUNT: {word_min}–{word_max} words for this page. "
        f"Do not exceed {word_max}. Do not pad to hit {word_min} if the beat is naturally shorter."
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
Story brief (for prose consistency):
  Title: {brief.title}
  Story: {brief.description}
  Lesson (never state this directly): {brief.lesson}

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
  Is cover: {"yes. Write the title only. No body text at all." if beat.order == 0 else "no"}

Write the page text ({word_min}–{word_max} words) and full illustration_metadata.
The assembled_prompt in illustration_metadata must include the art style "{art_style}" \
and all visual anchors listed above.
"""


def _humanize_text(text: str) -> str:
    """
    Post-processing safety net: strip punctuation patterns that read as AI-generated
    even when the LLM ignores the system prompt instructions.

    Rules applied in order:
    1.  " — " (em-dash with spaces)  →  ". " (new sentence feels more natural)
    2.  "—" (mid-word em-dash)        →  " " (separate the words cleanly)
    3.  " – " (en-dash with spaces)   →  ", " (softer pause)
    4.  "–" (mid-word en-dash)        →  "-"  (keep as plain hyphen)
    5.  " - " (spaced hyphen, AI tell) → ", " (unless it looks like a list bullet)
    6.  Semicolons                     →  ". " (break into sentences)
    7.  " ... " (spaced ellipsis)      →  "... " (tighten)
    8.  Collapse any double-spaces left behind.
    9.  Capitalise the first letter after any ". " we introduced.
    """
    # 1. Em-dash with surrounding spaces → new sentence
    text = re.sub(r"\s*—\s*", ". ", text)

    # 2. En-dash with surrounding spaces → comma pause
    text = re.sub(r"\s*–\s*", ", ", text)

    # 3. Spaced hyphen used as a clause separator (not a compound word hyphen)
    #    e.g. "she ran - her heart racing" → "she ran, her heart racing"
    text = re.sub(r"(?<=[a-zA-Z,!?])\s+-\s+(?=[a-zA-Z])", ", ", text)

    # 4. Semicolons → full stop (capitalise next word below)
    text = re.sub(r";\s*", ". ", text)

    # 5. Tighten spaced ellipsis
    text = re.sub(r"\s+\.\.\.\s+", "... ", text)

    # 6. Collapse double spaces
    text = re.sub(r"  +", " ", text)

    # 7. Capitalise first letter after a sentence-ending period we introduced
    text = re.sub(r"\.\s+([a-z])", lambda m: ". " + m.group(1).upper(), text)

    return text.strip()
