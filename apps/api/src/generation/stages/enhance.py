import json

from src.generation.constants import GEMINI_FLASH, TEMP_ENHANCE
from src.generation.llm_client import LLMClient
from src.generation.prompts.system import ENHANCE
from src.generation.schemas import StoryBrief


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
    ) -> StoryBrief:
        prompt = _build_prompt(raw_prompt, age_range, tone, safety, page_count)
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
) -> str:
    tone_str = ", ".join(tone) if tone else "neutral"
    safety_str = (
        "Safety filters are ON — avoid scary themes, violence, and unkind language."
        if safety
        else "Safety filters are OFF — standard editorial judgment applies."
    )
    return f"""\
Story idea: "{raw_prompt}"

Audience:
- Age range: {age_range}
- Tone: {tone_str}
- {safety_str}

Target length: {page_count} content pages (plus a cover page).

Develop this idea into a full story brief. Choose the narrative structure that fits \
this story naturally — name it yourself. The arc stages you define will map directly \
to the page structure, so ensure their combined page_span values sum to {page_count}.
"""
