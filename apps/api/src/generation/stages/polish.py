"""
PolishStage — second LLM pass that humanises and improves prose quality.

Runs after PageStage on every non-cover page. Uses the fast model (Flash)
since this is an editorial pass, not a creative generation step.
All pages are polished concurrently behind a semaphore.
"""
import asyncio
import logging

from src.generation.constants import GEMINI_FLASH, TEMP_PAGES
from src.generation.llm_client import LLMClient
from src.generation.prompts.system import POLISH, _AGE_VOICE
from src.generation.schemas import GeneratedPage, PolishedText

logger = logging.getLogger(__name__)

# Keep polish passes below the page-gen concurrency to avoid rate-limit spikes
_POLISH_CONCURRENCY = 4
_POLISH_TEMPERATURE = 0.5   # Enough creativity to rephrase; grounded enough to stay faithful


class PolishStage:
    def __init__(self, client: LLMClient, model: str = GEMINI_FLASH) -> None:
        self._client = client
        self._model = model
        self._sem = asyncio.Semaphore(_POLISH_CONCURRENCY)

    async def run(
        self,
        pages: list[GeneratedPage],
        age_range: str,
    ) -> list[GeneratedPage]:
        """
        Return a new list of GeneratedPage objects with polished text.
        Cover pages are passed through unchanged.
        """
        tasks = [self._polish_page(page, age_range) for page in pages]
        return list(await asyncio.gather(*tasks))

    async def _polish_page(
        self,
        page: GeneratedPage,
        age_range: str,
    ) -> GeneratedPage:
        # Cover pages have only a title — skip
        if page.is_cover or not page.text or len(page.text.split()) < 5:
            return page

        async with self._sem:
            try:
                age_guidance = _AGE_VOICE.get(age_range, "")
                system = POLISH + (f"\n\nAGE CONTEXT:\n{age_guidance}" if age_guidance else "")

                user_prompt = (
                    f"AGE RANGE: {age_range}\n\n"
                    f"ORIGINAL PAGE TEXT:\n{page.text}\n\n"
                    f"Return only the polished text. Same scene. More alive."
                )

                result = await self._client.generate(
                    prompt=user_prompt,
                    schema=PolishedText,
                    system=system,
                    model=self._model,
                    temperature=_POLISH_TEMPERATURE,
                )

                polished = result.text.strip()

                # Safety: if the polish somehow returned empty or is wildly different
                # in length (> 3x), fall back to the original
                original_wc = len(page.text.split())
                polished_wc = len(polished.split())
                if not polished or polished_wc > original_wc * 3 or polished_wc < 3:
                    logger.warning(
                        "Polish returned unexpected result for page %d (orig=%d words, polished=%d words) — keeping original",
                        page.order, original_wc, polished_wc,
                    )
                    return page

                logger.debug(
                    "Polished page %d: %d → %d words",
                    page.order, original_wc, polished_wc,
                )
                return page.model_copy(update={"text": polished, "word_count": polished_wc})

            except Exception as exc:
                # Polish is best-effort — a failure should never break the whole book
                logger.warning("Polish failed for page %d: %s — keeping original", page.order, exc)
                return page
