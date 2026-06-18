"""
BriefStage — combines character definition + page planning into one LLM call.

Replaces CharacterStage + OutlineStage. Takes the StoryBrief from EnhanceStage
and produces a StoryPlan: full character sheets with visual anchors, plus a
page-by-page plan that PageStage will write from.
"""
import json

from src.generation.constants import GEMINI_FLASH, TEMP_OUTLINE
from src.generation.llm_client import LLMClient
from src.generation.schemas import StoryBrief, StoryPlan


_SYSTEM = """\
You are a children's book editor and art director.

Given a story brief, produce two things in one pass:
1. CHARACTER SHEETS — visual anchors for consistent illustration across every page.
2. PAGE PLAN — a clear one-sentence summary for each page, 0 to N.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHARACTER RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Only name characters who appear on multiple pages.
- visual_anchors must be 4–6 SPECIFIC, LOCKABLE traits for illustration:
  "emerald scales", "red sneakers with white laces", "gap-toothed smile".
  Never: "friendly-looking", "cute".
- illustration_prompt must be a complete image-gen prompt:
  [species/type], [physical details], [clothing], [characteristic expression/pose].

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAGE PLAN RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- order=0 is always the cover: protagonist in their world, striking visual, no story yet.
- Each page summary is ONE sentence — specific, concrete, tells exactly what happens.
  GOOD: "Mia falls into the pool on her first try and comes up laughing."
  BAD: "Mia tries something new and learns a lesson."
- Every requirement from the brief.requirements list must be explicitly covered
  in at least one page's summary. If it needs a dedicated page, add one.
- settings must be visually distinct across adjacent pages.
- emotional_note tells the prose writer the exact tone — specific, not generic.
"""


class BriefStage:
    def __init__(self, client: LLMClient, model: str = GEMINI_FLASH) -> None:
        self._client = client
        self._model = model

    async def run(
        self,
        brief: StoryBrief,
        page_count: int,
        art_style: str,
    ) -> StoryPlan:
        prompt = _build_prompt(brief, page_count, art_style)
        return await self._client.generate(
            prompt=prompt,
            schema=StoryPlan,
            system=_SYSTEM,
            model=self._model,
            temperature=TEMP_OUTLINE,
        )


def _build_prompt(brief: StoryBrief, page_count: int, art_style: str) -> str:
    requirements_block = ""
    if brief.requirements:
        reqs = "\n".join(f"  {i+1}. {r}" for i, r in enumerate(brief.requirements))
        requirements_block = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIREMENTS — each must appear explicitly in a page summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{reqs}

If satisfying all requirements needs more than {page_count} content pages, add the extra pages.
Requirements take priority over page count.
"""

    return f"""\
Story brief:
  Title: {brief.title}
  Description: {brief.description}
  Lesson: {brief.lesson}
  Characters: {", ".join(brief.characters_intro)}
  Themes: {", ".join(brief.themes)}

Art style: {art_style}
Target: {page_count} content pages + 1 cover = {page_count + 1} pages total (order 0 through {page_count}).
{requirements_block}
Now produce the character sheets and the full page plan.
"""
