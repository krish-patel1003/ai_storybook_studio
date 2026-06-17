from src.generation.constants import GEMINI_FLASH, TEMP_ENHANCE
from src.generation.llm_client import LLMClient
from src.generation.prompts.system import EXPAND_PROMPT
from src.generation.schemas import ExpandedPrompt


class ExpandStage:
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
    ) -> ExpandedPrompt:
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
- Tone: {tone_str}
- {safety_str}
- Target length: {page_count} pages

Expand this into a rich, exciting story concept. Be specific, vivid, and faithful \
to what the user asked for. Make them excited to generate this book.
"""
        return await self._client.generate(
            prompt=user_prompt,
            schema=ExpandedPrompt,
            system=EXPAND_PROMPT,
            model=self._model,
            temperature=TEMP_ENHANCE,
        )
