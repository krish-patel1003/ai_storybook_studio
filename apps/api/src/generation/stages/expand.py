from src.generation.constants import GEMINI_FLASH, TEMP_ENHANCE
from src.generation.llm_client import LLMClient
from src.generation.prompts.system import BRAINSTORM_PROMPT, EXPAND_PROMPT
from src.generation.schemas import BrainstormResult, ExpandedPromptOptions


class BrainstormStage:
    """Generates 6 short story seed ideas to spark the user's imagination."""

    def __init__(self, client: LLMClient, model: str = GEMINI_FLASH) -> None:
        self._client = client
        self._model = model

    async def run(
        self,
        age_range: str,
        tone: list[str],
        page_count: int,
    ) -> BrainstormResult:
        tone_str = ", ".join(tone) if tone else "neutral"
        user_prompt = f"""\
Generate 6 story seed ideas for a children's book with these parameters:
- Age range: {age_range}
- Tone / themes: {tone_str}
- Target length: {page_count} pages

Each seed must be completely different from the others. Make them specific, vivid, \
and irresistible to a child flipping through a bookshelf.
"""
        return await self._client.generate(
            prompt=user_prompt,
            schema=BrainstormResult,
            system=BRAINSTORM_PROMPT,
            model=self._model,
            temperature=0.95,
        )


class ExpandStage:
    """Expands a user's prompt into 2 distinct story concepts to choose from."""

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
    ) -> ExpandedPromptOptions:
        tone_str = ", ".join(tone) if tone else "neutral"
        safety_str = (
            "Safety filters ON — keep themes gentle, age-appropriate, no scary content."
            if safety
            else "Safety filters OFF — standard editorial judgment applies."
        )
        user_prompt = f"""\
Story idea: "{raw_prompt}"

Audience:
- Age range: {age_range}
- Themes: {tone_str}
- {safety_str}
- Target length: {page_count} pages

Generate exactly 2 different takes on this idea. Both must be faithful to the user's \
idea. Make each concept so vivid and exciting that the user has a hard time picking just one.
"""
        return await self._client.generate(
            prompt=user_prompt,
            schema=ExpandedPromptOptions,
            system=EXPAND_PROMPT,
            model=self._model,
            temperature=TEMP_ENHANCE,
        )
