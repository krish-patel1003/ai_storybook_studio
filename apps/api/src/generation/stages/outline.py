import json

from src.generation.constants import GEMINI_FLASH, TEMP_OUTLINE
from src.generation.llm_client import LLMClient
from src.generation.prompts.system import OUTLINE
from src.generation.schemas import CharacterSheet, StoryBeat, StoryBrief, StoryOutline


class OutlineStage:
    def __init__(self, client: LLMClient, model: str = GEMINI_FLASH) -> None:
        self._client = client
        self._model = model

    async def run(
        self,
        brief: StoryBrief,
        characters: list[CharacterSheet],
        page_count: int,
    ) -> list[StoryBeat]:
        prompt = _build_prompt(brief, characters, page_count)
        outline = await self._client.generate(
            prompt=prompt,
            schema=StoryOutline,
            system=OUTLINE,
            model=self._model,
            temperature=TEMP_OUTLINE,
        )
        return sorted(outline.beats, key=lambda b: b.order)


def _build_prompt(
    brief: StoryBrief,
    characters: list[CharacterSheet],
    page_count: int,
) -> str:
    char_names = [c.name for c in characters]
    total = page_count + 1

    return f"""\
Story brief:
{json.dumps(brief.model_dump(), indent=2)}

Available characters: {", ".join(char_names)}

Target: {page_count} content beats + 1 cover beat = {total} beats total.

Write exactly {total} beats:
- Beat at order=0 is the cover: a striking visual introduction of the protagonist in their world.
  No narrative yet. Just character and atmosphere.
- Beats at order=1 through order={page_count} are the content pages.
- Distribute the arc stages proportionally. The arc stage page_span values in the brief are your guide.
- Every beat must suggest a visually distinct scene from adjacent beats.
"""
