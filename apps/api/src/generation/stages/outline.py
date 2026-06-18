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

    requirements_block = ""
    if brief.requirements:
        reqs = "\n".join(f"  {i+1}. {r}" for i, r in enumerate(brief.requirements))
        requirements_block = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY REQUIREMENTS — every one MUST map to a specific beat
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{reqs}

For each requirement above, at least one beat must explicitly describe fulfilling it.
If fulfilling all requirements needs more than {page_count} content pages, write the extra beats —
page count is a target, not a cap. Requirements always win.
"""

    return f"""\
Story brief:
{json.dumps(brief.model_dump(exclude={"requirements"}), indent=2)}

Available characters: {", ".join(char_names)}

Target: {page_count} content beats + 1 cover beat = {total} beats total.
{requirements_block}
Write the beats:
- Beat at order=0 is the cover: a striking visual introduction of the protagonist in their world.
  No narrative yet. Just character and atmosphere.
- Beats at order=1 onwards are content pages.
- Distribute the arc stages proportionally. The arc stage page_span values in the brief are your guide.
- Every beat must suggest a visually distinct scene from adjacent beats.
- Each requirement above must be traceable to a beat — write it explicitly in that beat's description.
"""
