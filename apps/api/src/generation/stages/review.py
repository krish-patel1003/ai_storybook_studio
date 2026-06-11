"""
ReviewStage — automatic quality review and rewrite pass.

Runs after PolishStage on the complete book. Reads all pages as a unit,
scores each non-cover page 1–5, and rewrites any page scoring ≤ 3.

This is the only stage that sees the full book at once — it catches problems
that per-page generation misses: vocabulary too complex for the age group,
AI-sounding phrases that slipped past the prompt guards, emotion labels,
sentences that are too long, and plot pages that do too many things.

Uses the fast model (Flash) at low temperature — this is a precise editorial
task, not creative generation.
"""
import asyncio
import logging

from src.generation.constants import GEMINI_FLASH, TEMP_REVIEW
from src.generation.llm_client import LLMClient
from src.generation.prompts.system import REVIEW, _AGE_VOICE
from src.generation.schemas import BookReview, GeneratedPage

logger = logging.getLogger(__name__)

# Score threshold: pages at or below this score get their text replaced
_REWRITE_THRESHOLD = 3

# Cap on concurrent calls — review sends the full book context so it's heavier
_REVIEW_CONCURRENCY = 2


class ReviewStage:
    def __init__(self, client: LLMClient, model: str = GEMINI_FLASH) -> None:
        self._client = client
        self._model = model
        self._sem = asyncio.Semaphore(_REVIEW_CONCURRENCY)

    async def run(
        self,
        pages: list[GeneratedPage],
        age_range: str,
    ) -> list[GeneratedPage]:
        """
        Review the complete book and apply rewrites to pages scoring ≤ threshold.
        Cover pages are never touched.
        Returns a new list with the same order as the input.
        """
        non_cover = [p for p in pages if not p.is_cover and p.text]
        if not non_cover:
            return pages

        async with self._sem:
            review = await self._run_review(non_cover, age_range)

        # Build lookup: order → rewrite
        rewrites: dict[int, str] = {}
        for pr in review.page_reviews:
            if pr.score <= _REWRITE_THRESHOLD and pr.rewrite and pr.rewrite.strip():
                # Sanity check: don't accept a rewrite that's wildly different in length
                original = next((p for p in non_cover if p.order == pr.order), None)
                if original:
                    orig_wc = len(original.text.split())
                    new_wc = len(pr.rewrite.split())
                    if new_wc > orig_wc * 2.5 or new_wc < 3:
                        logger.warning(
                            "Review rewrite for page %d rejected: length %d→%d words — keeping polished version",
                            pr.order, orig_wc, new_wc,
                        )
                        continue
                rewrites[pr.order] = pr.rewrite.strip()
                logger.info(
                    "Review: page %d scored %d — rewriting (%d issues: %s)",
                    pr.order, pr.score, len(pr.issues), "; ".join(pr.issues[:3]),
                )
            elif pr.score <= _REWRITE_THRESHOLD:
                logger.warning(
                    "Review: page %d scored %d but no rewrite provided — keeping polished version",
                    pr.order, pr.score,
                )
            else:
                logger.debug("Review: page %d scored %d — keeping as-is", pr.order, pr.score)

        if not rewrites:
            logger.info("Review: all pages passed — no rewrites applied")
            return pages

        # Apply rewrites
        result = []
        for page in pages:
            if page.order in rewrites:
                new_text = rewrites[page.order]
                result.append(page.model_copy(update={
                    "text": new_text,
                    "word_count": len(new_text.split()),
                }))
            else:
                result.append(page)

        logger.info(
            "Review complete: %d/%d pages rewritten",
            len(rewrites), len(non_cover),
        )
        return result

    async def _run_review(
        self,
        pages: list[GeneratedPage],
        age_range: str,
    ) -> BookReview:
        age_guidance = _AGE_VOICE.get(age_range, "")
        system = REVIEW + (f"\n\nAGE RULES FOR THIS BOOK:\n{age_guidance}" if age_guidance else "")

        # Build the full book text as context
        pages_text = "\n\n".join(
            f"--- PAGE {p.order} ---\n{p.text}"
            for p in sorted(pages, key=lambda p: p.order)
        )

        user_prompt = (
            f"AGE RANGE: {age_range}\n\n"
            f"COMPLETE BOOK DRAFT:\n\n{pages_text}\n\n"
            f"Review every page above. "
            f"Score each one 1–5 using the criteria in your instructions. "
            f"For any page scoring 3 or below, provide a complete rewrite in the rewrite field. "
            f"Be strict — a page with even one complex word or one long sentence is a 3, not a 4."
        )

        try:
            result = await self._client.generate(
                prompt=user_prompt,
                schema=BookReview,
                system=system,
                model=self._model,
                temperature=TEMP_REVIEW,
            )
            return result
        except Exception as exc:
            logger.warning("ReviewStage failed (non-fatal): %s — skipping rewrites", exc)
            # Return a dummy review that scores everything as 5 (no rewrites)
            from src.generation.schemas import PageReview
            return BookReview(
                page_reviews=[
                    PageReview(order=p.order, score=5, issues=[], rewrite=None)
                    for p in pages
                ]
            )
