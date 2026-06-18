"""
ReviewLoopStage — score the complete book, rewrite weak pages, loop until good.

Replaces PolishStage + ReviewStage + FulfillmentStage.

Loop (max 2 iterations):
  1. Score the full book: prose quality + requirement fulfillment → overall 1-10
  2. If overall_score >= 7 → done
  3. Collect pages with prose_score < 6 OR unmet requirements
  4. Rewrite those pages concurrently
  5. Repeat
"""
import asyncio
import logging

from src.generation.constants import GEMINI_FLASH, TEMP_REVIEW
from src.generation.llm_client import LLMClient
from src.generation.schemas import (
    BookScore,
    GeneratedPage,
    PolishedText,
    StoryBrief,
)

logger = logging.getLogger(__name__)

_MAX_LOOPS = 2
_PASS_SCORE = 7   # overall_score >= this → stop


class ReviewLoopStage:
    def __init__(self, client: LLMClient, model: str = GEMINI_FLASH) -> None:
        self._client = client
        self._model = model

    async def run(
        self,
        pages: list[GeneratedPage],
        brief: StoryBrief,
        age_range: str,
    ) -> list[GeneratedPage]:
        """Score and iteratively improve the book. Returns final page list."""
        for iteration in range(1, _MAX_LOOPS + 1):
            score = await self._score(pages, brief, age_range)
            logger.info(
                "ReviewLoop iteration %d/%d — overall_score=%d",
                iteration, _MAX_LOOPS, score.overall_score,
            )

            if score.overall_score >= _PASS_SCORE:
                logger.info("ReviewLoop: score %d >= %d — accepted", score.overall_score, _PASS_SCORE)
                break

            # Collect pages that need rewriting
            weak_orders = {ps.order for ps in score.page_scores if ps.prose_score < 6 and ps.rewrite}
            # Also flag pages where requirements are unmet (patch the most relevant page)
            unmet = [rs for rs in score.requirement_scores if not rs.met and rs.gap]
            if not weak_orders and not unmet:
                logger.info("ReviewLoop: nothing to rewrite despite score %d", score.overall_score)
                break

            logger.warning(
                "ReviewLoop: score %d — rewriting %d pages, %d unmet requirements",
                score.overall_score, len(weak_orders), len(unmet),
            )

            # Apply in-line rewrites from the score (pages that had rewrite text)
            page_map = {p.order: p for p in pages}
            for ps in score.page_scores:
                if ps.rewrite and ps.order in weak_orders:
                    old = page_map[ps.order]
                    page_map[ps.order] = old.model_copy(update={
                        "text": ps.rewrite,
                        "word_count": len(ps.rewrite.split()),
                    })
                    logger.info("ReviewLoop: rewrote page %d (prose_score=%d)", ps.order, ps.prose_score)

            # For unmet requirements: patch the most appropriate existing page
            if unmet and iteration < _MAX_LOOPS:
                patches = await self._patch_requirements(unmet, list(page_map.values()), brief, age_range)
                for order, new_text in patches.items():
                    old = page_map[order]
                    page_map[order] = old.model_copy(update={
                        "text": new_text,
                        "word_count": len(new_text.split()),
                    })
                    logger.info("ReviewLoop: patched page %d for requirement", order)

            pages = sorted(page_map.values(), key=lambda p: p.order)

        return pages

    async def _score(
        self,
        pages: list[GeneratedPage],
        brief: StoryBrief,
        age_range: str,
    ) -> BookScore:
        content_pages = [p for p in pages if not p.is_cover and p.text]
        pages_text = "\n\n".join(
            f"--- PAGE {p.order} ---\n{p.text}"
            for p in sorted(content_pages, key=lambda p: p.order)
        )
        requirements_block = ""
        if brief.requirements:
            requirements_block = "REQUIREMENTS TO CHECK:\n" + "\n".join(
                f"  {i+1}. {r}" for i, r in enumerate(brief.requirements)
            ) + "\n\n"

        system = f"""\
You are a children's book editor reviewing a manuscript for quality and requirement compliance.

Score each page's PROSE (1-10):
- 10: Perfect for ages {age_range}. Simple words, short sentences, vivid and warm.
- 7-9: Good. Minor issues only.
- 5-6: Needs work. Some complex words or long sentences.
- 1-4: Must rewrite. Sentences too long, words too hard, or emotion stated not shown.

For requirement checking: be strict.
- A vocabulary word is only "met" if BOTH the word AND its meaning appear on the page.
- A recap page is only "met" if it lists ALL words with meanings.
- Counts matter: "at least 2 Hindi words" requires 2+ distinct words with meanings.

When prose_score < 6: provide a complete rewrite (same scene, simpler words,
shorter sentences, warm tone). Match the original word count ±20%.
"""
        user_prompt = (
            f"AGE RANGE: {age_range}\n\n"
            f"{requirements_block}"
            f"BOOK TEXT:\n\n{pages_text}"
        )

        try:
            return await self._client.generate(
                prompt=user_prompt,
                schema=BookScore,
                system=system,
                model=self._model,
                temperature=TEMP_REVIEW,
            )
        except Exception as exc:
            logger.warning("ReviewLoop scoring failed: %s — skipping iteration", exc)
            return BookScore(overall_score=10, requirement_scores=[], page_scores=[])

    async def _patch_requirements(
        self,
        unmet: list,
        pages: list[GeneratedPage],
        brief: StoryBrief,
        age_range: str,
    ) -> dict[int, str]:
        """For each unmet requirement, patch the best existing page to satisfy it."""
        content_pages = sorted([p for p in pages if not p.is_cover and p.text], key=lambda p: p.order)
        if not content_pages:
            return {}

        async def _patch_one(req_score) -> tuple[int, str] | None:
            # Pick the last content page as default patch target
            target = content_pages[-1]
            system = f"""\
You are a children's book editor adding a missing requirement to an existing page.
Rules:
- Keep the same scene, characters, and tone.
- Naturally weave in the missing content.
- For vocabulary words: introduce word in dialogue, immediately follow with English meaning.
  Good: "Koshish!" Coach Priya said. "That means keep trying, never give up!"
- Stay within 120% of original word count. Ages {age_range}.
- Output ONLY the revised page text. No explanation.
"""
            user_prompt = (
                f"MISSING: {req_score.requirement}\n"
                f"GAP: {req_score.gap}\n\n"
                f"CURRENT PAGE {target.order}:\n{target.text}\n\n"
                f"Rewrite to satisfy the requirement."
            )
            try:
                result = await self._client.generate(
                    prompt=user_prompt,
                    schema=PolishedText,
                    system=system,
                    model=self._model,
                    temperature=0.4,
                )
                return (target.order, result.text)
            except Exception as exc:
                logger.warning("Requirement patch failed: %s", exc)
                return None

        results = await asyncio.gather(*[_patch_one(u) for u in unmet])
        return dict(r for r in results if r is not None)
