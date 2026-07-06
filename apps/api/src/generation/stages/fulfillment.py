"""
FulfillmentStage — post-generation requirement audit and patch.

Runs after ReviewStage on the complete book. Reads every page as a unit,
checks each requirement from the brief against what was actually written,
and repairs any gaps by either:
  - patching an existing page (adding a sentence or two), or
  - inserting a new page (e.g. a vocabulary recap)

This stage is the safety net that catches what the outline and page stages
missed — even when the LLM ignored the MUST DELIVER block.

Only fires if brief.requirements is non-empty.
"""
import asyncio
import logging
import json

from src.generation.constants import GEMINI_FLASH, GEMINI_PRO, TEMP_REVIEW
from src.generation.llm_client import LLMClient
from src.generation.schemas import (
    FulfillmentAudit,
    GeneratedPage,
    IllustrationMetadata,
    NewPage,
    PagePatch,
    StoryBrief,
)

logger = logging.getLogger(__name__)

_AUDIT_CONCURRENCY = 1  # audit reads full book — keep sequential


class FulfillmentStage:
    def __init__(self, client: LLMClient, model: str = GEMINI_FLASH) -> None:
        self._client = client
        self._model = model

    async def run(
        self,
        pages: list[GeneratedPage],
        brief: StoryBrief,
        age_range: str,
        art_style: str,
    ) -> list[GeneratedPage]:
        """
        Audit requirements and repair gaps. Returns updated page list.
        Pages may be added (page count can increase). Order numbers are
        renumbered cleanly after any insertions.
        """
        if not brief.requirements:
            logger.debug("FulfillmentStage: no requirements — skipping")
            return pages

        non_cover = [p for p in pages if not p.is_cover and p.text]
        if not non_cover:
            return pages

        audit = await self._audit(non_cover, brief, age_range)

        failing = [c for c in audit.checks if not c.fulfilled]
        if not failing:
            logger.info("FulfillmentStage: all %d requirements fulfilled", len(audit.checks))
            return pages

        logger.warning(
            "FulfillmentStage: %d/%d requirements unfulfilled — repairing",
            len(failing), len(audit.checks),
        )
        for f in failing:
            logger.warning("  MISSING: %s | gap: %s | fix: %s", f.requirement[:80], f.gap, f.fix_strategy)

        # Separate into patches and new pages
        patch_items = [c for c in failing if c.fix_strategy and c.fix_strategy.startswith("patch")]
        new_page_items = [c for c in failing if c.fix_strategy == "new_page"]

        # Apply patches concurrently
        patches: list[PagePatch] = []
        if patch_items:
            patches = await self._generate_patches(patch_items, pages, brief, age_range)

        # Generate new pages concurrently
        new_pages: list[NewPage] = []
        if new_page_items:
            new_pages = await self._generate_new_pages(new_page_items, pages, brief, age_range, art_style)

        return self._apply(pages, patches, new_pages)

    async def _audit(
        self,
        pages: list[GeneratedPage],
        brief: StoryBrief,
        age_range: str,
    ) -> FulfillmentAudit:
        pages_text = "\n\n".join(
            f"--- PAGE {p.order} ---\n{p.text}"
            for p in sorted(pages, key=lambda p: p.order)
        )
        requirements_list = "\n".join(
            f"{i+1}. {r}" for i, r in enumerate(brief.requirements)
        )

        system = """\
You are a children's book editor auditing a manuscript for requirement compliance.

For each requirement provided, check whether it is clearly and completely satisfied
in the full book text. Be precise and strict:
- A vocabulary word is only "fulfilled" if BOTH the word AND its meaning appear on the page.
  "Coach says Koshish" alone is NOT fulfilled — the meaning must also be stated.
- A recap page is only "fulfilled" if it lists the words with their meanings in readable form.
- Counts matter: "at least 2 Hindi words" requires exactly 2 or more distinct Hindi words.

For each unfulfilled requirement:
1. Write a precise gap description (what specifically is missing).
2. Choose a fix strategy:
   - "patch_page_N" if the fix can be done by adding 1–2 sentences to an existing page.
     Replace N with the page order number of the best page to patch.
   - "new_page" if the fix requires a full dedicated page (e.g. a vocab recap page,
     or a teaching moment that needs its own scene).
"""
        user_prompt = (
            f"AGE RANGE: {age_range}\n\n"
            f"REQUIREMENTS TO CHECK:\n{requirements_list}\n\n"
            f"COMPLETE BOOK TEXT:\n\n{pages_text}\n\n"
            f"Audit every requirement above. For each one, determine if it is fully satisfied."
        )

        try:
            return await self._client.generate(
                prompt=user_prompt,
                schema=FulfillmentAudit,
                system=system,
                model=self._model,
                temperature=0.1,
            )
        except Exception as exc:
            logger.warning("FulfillmentStage audit failed: %s — skipping repairs", exc)
            return FulfillmentAudit(checks=[])

    async def _generate_patches(
        self,
        failing: list,
        pages: list[GeneratedPage],
        brief: StoryBrief,
        age_range: str,
    ) -> list[PagePatch]:
        """For each patch requirement, generate a rewrite of the target page."""
        page_map = {p.order: p for p in pages}
        results: list[PagePatch] = []

        async def _patch_one(check) -> PagePatch | None:
            target_order = check.patch_target_page
            if target_order is None:
                # Fallback: pick the last content page
                content_pages = [p for p in pages if not p.is_cover]
                target_order = max(p.order for p in content_pages) if content_pages else 1

            page = page_map.get(target_order)
            if not page or not page.text:
                return None

            system = """\
You are a children's book editor adding a missing requirement to an existing page.

Rules:
- Keep the same scene, characters, and emotional tone.
- Naturally weave in the missing content — do NOT make it feel bolted on.
- For vocabulary words: have the character introduce the word in dialogue,
  then immediately follow with the English meaning.
  Good: "Courage!" Coach Priya called out. "That means being brave even when you're scared."
- Stay within 120% of the original word count.
- Present tense only.
- Output ONLY the revised page text. No explanation, no quotes.
"""
            user_prompt = (
                f"MISSING REQUIREMENT: {check.requirement}\n"
                f"GAP: {check.gap}\n\n"
                f"CURRENT PAGE {target_order} TEXT:\n{page.text}\n\n"
                f"Rewrite this page to satisfy the requirement while keeping everything else intact."
            )

            from src.generation.schemas import PolishedText
            try:
                result = await self._client.generate(
                    prompt=user_prompt,
                    schema=PolishedText,
                    system=system,
                    model=self._model,
                    temperature=0.4,
                )
                return PagePatch(page_order=target_order, new_text=result.text)
            except Exception as exc:
                logger.warning("Patch generation failed for page %d: %s", target_order, exc)
                return None

        patch_results = await asyncio.gather(*[_patch_one(c) for c in failing])
        return [p for p in patch_results if p is not None]

    async def _generate_new_pages(
        self,
        failing: list,
        pages: list[GeneratedPage],
        brief: StoryBrief,
        age_range: str,
        art_style: str,
    ) -> list[NewPage]:
        """For each new-page requirement, generate a full new page."""
        content_pages = sorted([p for p in pages if not p.is_cover], key=lambda p: p.order)
        last_order = max(p.order for p in content_pages) if content_pages else 1

        system = f"""\
You are writing a new page for a children's book to satisfy a missing requirement.

The page must:
- Be written at the appropriate reading level for ages {age_range}.
- Feel like a natural part of the book — not an afterthought.
- For vocabulary recap pages: list each word clearly with its meaning, in a friendly,
  child-facing format. E.g.:
    "Here are the words we learned this summer:
     Koshish (Hindi) — try, keep going
     Burbujas (Spanish) — bubbles
     Bravo (French) — well done / great job"
- Present tense. Simple words. Warm tone.
- For illustration_note: describe what a cheerful illustration of this page would look like.
"""
        all_page_text = "\n\n".join(
            f"PAGE {p.order}: {p.text}" for p in content_pages[-5:]  # last 5 for context
        )

        async def _new_one(check, insert_after: int) -> NewPage | None:
            user_prompt = (
                f"MISSING REQUIREMENT: {check.requirement}\n"
                f"GAP: {check.gap}\n\n"
                f"BOOK TITLE: {brief.title}\n"
                f"STORY: {brief.description}\n\n"
                f"RECENT PAGES (for context):\n{all_page_text}\n\n"
                f"Write a new page that satisfies this requirement. "
                f"It will be inserted after page {insert_after}."
            )

            from src.generation.schemas import NewPage as NewPageSchema
            try:
                result = await self._client.generate(
                    prompt=user_prompt,
                    schema=NewPageSchema,
                    system=system,
                    model=self._model,
                    temperature=0.5,
                )
                # Override after_order to ensure correct placement
                return NewPageSchema(
                    after_order=insert_after,
                    narrative_role=result.narrative_role,
                    text=result.text,
                    illustration_note=result.illustration_note,
                )
            except Exception as exc:
                logger.warning("New page generation failed: %s", exc)
                return None

        tasks = [_new_one(c, last_order) for c in failing]
        results = await asyncio.gather(*tasks)
        return [r for r in results if r is not None]

    def _apply(
        self,
        pages: list[GeneratedPage],
        patches: list[PagePatch],
        new_pages: list[NewPage],
    ) -> list[GeneratedPage]:
        """Apply patches and insert new pages. Renumber orders cleanly."""
        # Apply patches
        patch_map = {p.page_order: p.new_text for p in patches}
        result = []
        for page in sorted(pages, key=lambda p: p.order):
            if page.order in patch_map:
                new_text = patch_map[page.order]
                result.append(page.model_copy(update={
                    "text": new_text,
                    "word_count": len(new_text.split()),
                }))
                logger.info("FulfillmentStage: patched page %d", page.order)
            else:
                result.append(page)

        # Insert new pages after their target orders
        for new_page in new_pages:
            # Find the max order currently in result to assign order
            current_max = max(p.order for p in result)
            new_order = current_max + 1

            # Build a minimal GeneratedPage for the new page
            generated = GeneratedPage(
                order=new_order,
                is_cover=False,
                beat_reference=new_page.narrative_role,
                text=new_page.text,
                word_count=len(new_page.text.split()),
                illustration_metadata=IllustrationMetadata(
                    mood="warm and inviting",
                    characters_present=[],
                    key_visual_elements=[new_page.illustration_note],
                    composition_note=new_page.illustration_note,
                    assembled_prompt=(
                        f"Children's book illustration, {new_page.illustration_note}, "
                        f"warm colours, friendly atmosphere"
                    ),
                    negative_prompt="dark, scary, violent, adult themes",
                ),
            )
            result.append(generated)
            logger.info(
                "FulfillmentStage: inserted new page %d (%s)",
                new_order, new_page.narrative_role,
            )

        return sorted(result, key=lambda p: p.order)
