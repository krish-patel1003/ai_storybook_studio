from __future__ import annotations

from src.generation.constants import GEMINI_FLASH, TEMP_ENHANCE
from src.generation.llm_client import LLMClient
from src.generation.prompts.system import ENHANCE
from src.generation.schemas import ExpandedPrompt, StoryBrief


class EnhanceStage:
    def __init__(self, client: LLMClient, model: str = GEMINI_FLASH) -> None:
        self._client = client
        self._model = model

    async def run(
        self,
        raw_prompt: str,
        age_range: str,
        tone: list[str],
        safety: bool,
        page_count: int,
        expanded_concept: ExpandedPrompt | None = None,
    ) -> StoryBrief:
        prompt = _build_prompt(raw_prompt, age_range, tone, safety, page_count, expanded_concept)
        return await self._client.generate(
            prompt=prompt,
            schema=StoryBrief,
            system=ENHANCE,
            model=self._model,
            temperature=TEMP_ENHANCE,
        )


def _build_prompt(
    raw_prompt: str,
    age_range: str,
    tone: list[str],
    safety: bool,
    page_count: int,
    expanded_concept: ExpandedPrompt | None = None,
) -> str:
    tone_str = ", ".join(tone) if tone else "neutral"
    safety_str = (
        "Safety filters are ON — avoid scary themes, violence, and unkind language."
        if safety
        else "Safety filters are OFF — standard editorial judgment applies."
    )

    if expanded_concept:
        characters_str = "\n".join(f"  - {c}" for c in expanded_concept.key_characters)
        highlights_str = "\n".join(f"  - {h}" for h in expanded_concept.story_highlights)
        concept_block = f"""\

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APPROVED STORY CONCEPT (use this as your foundation)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title: {expanded_concept.title}

Story concept:
{expanded_concept.story_concept}

Characters:
{characters_str}

Key scene highlights:
{highlights_str}

Visual style: {expanded_concept.visual_style}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Build the brief directly from this approved concept. Keep the title, characters, \
and story beats faithful to what is described above. Do not invent a different story.
"""
    else:
        concept_block = ""

    return f"""\
Story idea: "{raw_prompt}"

Audience:
- Age range: {age_range}
- Themes: {tone_str}
- {safety_str}

Target length: {page_count} content pages (plus a cover page).
{concept_block}
Develop this into a full story brief. Choose the narrative structure that fits \
this story naturally — name it yourself. The arc stages you define will map directly \
to the page structure, so ensure their combined page_span values sum to {page_count}.
"""
