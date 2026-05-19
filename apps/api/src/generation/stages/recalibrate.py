import json

from src.generation.constants import GEMINI_FLASH, TEMP_RECALIBRATE
from src.generation.llm_client import LLMClient
from src.generation.prompts.system import RECALIBRATE
from src.generation.schemas import RecalibratedOutline, StoryBeat, StoryBrief


class RecalibrateStage:
    def __init__(self, client: LLMClient, model: str = GEMINI_FLASH) -> None:
        self._client = client
        self._model = model

    async def run(
        self,
        brief: StoryBrief,
        current_beats: list[StoryBeat],
        new_page_count: int,
        locked_orders: set[int],
    ) -> RecalibratedOutline:
        prompt = _build_prompt(brief, current_beats, new_page_count, locked_orders)
        return await self._client.generate(
            prompt=prompt,
            schema=RecalibratedOutline,
            system=RECALIBRATE,
            model=self._model,
            temperature=TEMP_RECALIBRATE,
        )


def _build_prompt(
    brief: StoryBrief,
    current_beats: list[StoryBeat],
    new_page_count: int,
    locked_orders: set[int],
) -> str:
    ordered = sorted(current_beats, key=lambda b: b.order)
    current_count = len([b for b in ordered if b.order > 0])

    locked_section = ""
    if locked_orders:
        locked_beats = [b for b in ordered if b.order in locked_orders]
        locked_section = (
            "\nLOCKED PAGES (must be preserved exactly — do not modify):\n"
            + json.dumps([b.model_dump() for b in locked_beats], indent=2)
            + "\n"
        )

    return f"""\
Story brief (for narrative coherence):
{json.dumps(brief.model_dump(), indent=2)}

Current outline ({current_count} content pages + cover = {len(ordered)} beats total):
{json.dumps([b.model_dump() for b in ordered], indent=2)}
{locked_section}
Target: {new_page_count} content pages + 1 cover = {new_page_count + 1} beats total.
Current: {current_count} content pages.
Change: {"expand by " + str(new_page_count - current_count) if new_page_count > current_count else "compress by " + str(current_count - new_page_count)} page(s).

Produce exactly {new_page_count + 1} beats (orders 0 through {new_page_count}).
Cover (order=0) is always preserved unchanged.
For each beat, set provenance to exactly one of:
  "preserved" — locked page, copied exactly
  "adapted from page N" — evolved from beat at order N
  "new" — genuinely new beat
"""
