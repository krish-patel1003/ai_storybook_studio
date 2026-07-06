import asyncio
import json
import re

from src.generation.constants import (
    GEMINI_PRO,
    PAGE_GEN_CONCURRENCY,
    PAGE_SPLIT_THRESHOLD,
    TEMP_PAGES,
    WORD_LIMITS,
)
from src.generation.llm_client import LLMClient
from src.generation.prompts.system import PAGES, _AGE_VOICE
from src.generation.schemas import (
    CharacterSheet,
    GeneratedPage,
    PagePlan,
    StoryBrief,
)


class PageStage:
    def __init__(self, client: LLMClient, model: str = GEMINI_PRO) -> None:
        self._client = client
        self._model = model
        self._sem = asyncio.Semaphore(PAGE_GEN_CONCURRENCY)

    async def run(
        self,
        brief: StoryBrief,
        characters: list[CharacterSheet],
        plans: list[PagePlan],  # was: beats: list[StoryBeat]
        age_range: str,
        art_style: str,
    ) -> list[GeneratedPage]:
        char_map = {c.name: c for c in characters}
        ordered = sorted(plans, key=lambda p: p.order)
        word_min, word_max = WORD_LIMITS.get(age_range, (45, 70))

        req_assignments = _assign_requirements_to_plans(brief.requirements, ordered)

        tasks = [
            self._generate_page(
                plan=plan,
                brief=brief,
                char_map=char_map,
                all_plans=ordered,
                age_range=age_range,
                art_style=art_style,
                word_min=word_min,
                word_max=word_max,
                page_requirements=req_assignments.get(plan.order, []),
            )
            for plan in ordered
        ]
        return await asyncio.gather(*tasks)

    async def _generate_page(
        self,
        *,
        plan: PagePlan,
        brief: StoryBrief,
        char_map: dict[str, CharacterSheet],
        all_plans: list[PagePlan],
        age_range: str,
        art_style: str,
        word_min: int,
        word_max: int,
        page_requirements: list[str] | None = None,
    ) -> GeneratedPage:
        async with self._sem:
            prompt = _build_page_prompt(
                plan=plan,
                brief=brief,
                char_map=char_map,
                all_plans=all_plans,
                age_range=age_range,
                art_style=art_style,
                word_min=word_min,
                word_max=word_max,
                page_requirements=page_requirements or [],
            )
            system = _build_page_system(age_range, word_min, word_max)
            page = await self._client.generate(
                prompt=prompt,
                schema=GeneratedPage,
                system=system,
                model=self._model,
                temperature=TEMP_PAGES,
            )
            # Humanise: strip AI punctuation tells before any further processing.
            if not page.is_cover and page.text:
                page = page.model_copy(update={"text": _humanize_text(page.text)})

            # Hard guard: trim only if the page is not a split candidate.
            # If word_count >= PAGE_SPLIT_THRESHOLD the service layer will split
            # the text into two pages — trimming here would destroy the second half.
            split_threshold = PAGE_SPLIT_THRESHOLD.get(age_range, 9999)
            if not page.is_cover and page.text:
                words = page.text.split()
                if len(words) > word_max and len(words) < split_threshold:
                    # Too long for one page but not long enough to warrant a split —
                    # trim to word_max at a sentence boundary.
                    trimmed = " ".join(words[:word_max])
                    for end in (".", "!", "?"):
                        idx = trimmed.rfind(end)
                        if idx > len(trimmed) // 2:
                            trimmed = trimmed[: idx + 1]
                            break
                    page = page.model_copy(update={"text": trimmed, "word_count": len(trimmed.split())})
            return page


def _build_page_system(age_range: str, word_min: int, word_max: int) -> str:
    voice = _AGE_VOICE.get(age_range, "")
    return (
        PAGES
        + f"\n\n{voice}"
        + f"\nWORD COUNT: {word_min}–{word_max} words for this page. "
        f"Do not exceed {word_max}. Do not pad to hit {word_min} if the beat is naturally shorter."
    )


def _assign_requirements_to_plans(
    requirements: list[str],
    plans: list[PagePlan],
) -> dict[int, list[str]]:
    """
    Heuristically assign requirements to page plans so each page's prompt can
    remind the LLM of what it must deliver.

    Strategy: for each requirement, find the plan whose description most
    closely matches keywords in the requirement (e.g. "Hindi", "swimming",
    "vocab recap", "final"). If no good match, assign to the last content plan.
    Multiple requirements can land on the same plan.
    """
    if not requirements or not plans:
        return {}

    import re

    content_plans = [p for p in plans if p.order != 0]  # exclude cover
    if not content_plans:
        return {}

    assignments: dict[int, list[str]] = {}

    def _score(req: str, plan: PagePlan) -> int:
        req_lower = req.lower()
        plan_text = (plan.summary + " " + plan.narrative_role + " " + plan.setting).lower()
        score = 0
        # Extract significant words from the requirement (3+ chars, not stopwords)
        stopwords = {"the", "and", "for", "with", "that", "this", "each", "page", "must", "will",
                     "from", "into", "its", "their", "they", "have", "has", "all", "any"}
        words = [w for w in re.findall(r"[a-z]+", req_lower) if len(w) >= 3 and w not in stopwords]
        for word in words:
            if word in plan_text:
                score += 1
        return score

    for req in requirements:
        req_lower = req.lower()
        # Special case: "final page", "last page", "recap" → assign to last content plan
        if any(kw in req_lower for kw in ("final page", "last page", "recap", "vocabulary list", "word list")):
            last_plan = content_plans[-1]
            assignments.setdefault(last_plan.order, []).append(req)
            continue

        # Find best matching plan
        scored = [(p, _score(req, p)) for p in content_plans]
        scored.sort(key=lambda x: -x[1])
        best_plan, best_score = scored[0]

        # Only assign if there's a meaningful match; otherwise assign to last plan
        target = best_plan if best_score >= 1 else content_plans[-1]
        assignments.setdefault(target.order, []).append(req)

    return assignments


def _build_page_prompt(
    *,
    plan: PagePlan,
    brief: StoryBrief,
    char_map: dict[str, CharacterSheet],
    all_plans: list[PagePlan],
    age_range: str,
    art_style: str,
    word_min: int,
    word_max: int,
    page_requirements: list[str] | None = None,
) -> str:
    anchor_lines = []
    for name in plan.characters_present:
        if char := char_map.get(name):
            anchors = ", ".join(char.visual_anchors)
            anchor_lines.append(f"  {name}: {anchors}")
    anchors_block = "\n".join(anchor_lines) if anchor_lines else "  (no named characters)"

    # Show previous and next page summaries for narrative continuity
    context_lines = []
    for p in sorted(all_plans, key=lambda x: x.order):
        if p.order == plan.order:
            continue
        if abs(p.order - plan.order) <= 2:
            context_lines.append(f"  Page {p.order}: {p.summary}")
    context_block = "\n".join(context_lines) if context_lines else "  (none)"

    must_deliver_block = ""
    if page_requirements and plan.order != 0:
        items = "\n".join(f"  ★ {r}" for r in page_requirements)
        must_deliver_block = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MUST DELIVER ON THIS PAGE — non-negotiable
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{items}

Hard requirements. Your page text MUST satisfy every item above.
For vocabulary words: introduce the word in dialogue/narration,
immediately follow with the English meaning.
Good: Coach Carlos blows bubbles. "Burbujas!" he calls — that means bubbles.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

    return f"""\
Story: {brief.title} — {brief.description}
Lesson (never state directly): {brief.lesson}

Character visual anchors for this page:
{anchors_block}

Art style: {art_style}

Nearby pages (for continuity — write THIS page only):
{context_block}
{must_deliver_block}
NOW WRITE PAGE {plan.order}:
  What happens: {plan.summary}
  Role: {plan.narrative_role}
  Tone: {plan.emotional_note}
  Characters: {", ".join(plan.characters_present) or "none"}
  Setting: {plan.setting}
  Is cover: {"yes — title only, no body text" if plan.order == 0 else "no"}

Write the page text ({word_min}–{word_max} words) and full illustration_metadata.
assembled_prompt must include art style "{art_style}" and all visual anchors above.
"""


def _humanize_text(text: str) -> str:
    """
    Post-processing safety net: strip punctuation patterns that read as AI-generated
    even when the LLM ignores the system prompt instructions.

    Rules applied in order:
    1.  " — " (em-dash with spaces)  →  ". " (new sentence feels more natural)
    2.  "—" (mid-word em-dash)        →  " " (separate the words cleanly)
    3.  " – " (en-dash with spaces)   →  ", " (softer pause)
    4.  "–" (mid-word en-dash)        →  "-"  (keep as plain hyphen)
    5.  " - " (spaced hyphen, AI tell) → ", " (unless it looks like a list bullet)
    6.  Semicolons                     →  ". " (break into sentences)
    7.  " ... " (spaced ellipsis)      →  "... " (tighten)
    8.  Collapse any double-spaces left behind.
    9.  Capitalise the first letter after any ". " we introduced.
    """
    # 1. Em-dash with surrounding spaces → new sentence
    text = re.sub(r"\s*—\s*", ". ", text)

    # 2. En-dash with surrounding spaces → comma pause
    text = re.sub(r"\s*–\s*", ", ", text)

    # 3. Spaced hyphen used as a clause separator (not a compound word hyphen)
    #    e.g. "she ran - her heart racing" → "she ran, her heart racing"
    text = re.sub(r"(?<=[a-zA-Z,!?])\s+-\s+(?=[a-zA-Z])", ", ", text)

    # 4. Semicolons → full stop (capitalise next word below)
    text = re.sub(r";\s*", ". ", text)

    # 5. Tighten spaced ellipsis
    text = re.sub(r"\s+\.\.\.\s+", "... ", text)

    # 6. Collapse double spaces
    text = re.sub(r"  +", " ", text)

    # 7. Capitalise first letter after a sentence-ending period we introduced
    text = re.sub(r"\.\s+([a-z])", lambda m: ". " + m.group(1).upper(), text)

    return text.strip()
