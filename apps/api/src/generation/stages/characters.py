import json

from src.generation.constants import GEMINI_PRO, TEMP_CHARACTERS
from src.generation.llm_client import LLMClient
from src.generation.prompts.system import CHARACTERS
from src.generation.schemas import CharacterRoster, CharacterSheet, StoryBrief


class CharacterStage:
    def __init__(self, client: LLMClient, model: str = GEMINI_PRO) -> None:
        self._client = client
        self._model = model

    async def run(self, brief: StoryBrief, art_style: str) -> list[CharacterSheet]:
        prompt = _build_prompt(brief, art_style)
        roster = await self._client.generate(
            prompt=prompt,
            schema=CharacterRoster,
            system=CHARACTERS,
            model=self._model,
            temperature=TEMP_CHARACTERS,
        )
        return roster.characters


def _build_prompt(brief: StoryBrief, art_style: str) -> str:
    return f"""\
Story brief:
{json.dumps(brief.model_dump(), indent=2)}

Art style for this book: {art_style}

Generate the full cast for this story. Include every character who will appear on \
multiple pages. The illustration_prompt for each character must be compatible with \
the "{art_style}" art style — reference it explicitly in the prompt.

Do not add characters not implied by the brief. Do not omit characters the story needs.
"""
