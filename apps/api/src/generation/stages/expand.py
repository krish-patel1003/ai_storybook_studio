import random
import uuid

from src.generation.constants import GEMINI_FLASH, TEMP_ENHANCE
from src.generation.llm_client import LLMClient
from src.generation.prompts.system import BRAINSTORM_PROMPT, EXPAND_PROMPT
from src.generation.schemas import BrainstormResult, ExpandedPrompt

# Wide, orthogonal idea pools. We sample a fresh, distinct mix on every call and
# hand them to the model as loose inspiration so successive batches don't circle
# the same handful of protagonists, settings, and premises.
_PROTAGONISTS = [
    "a curious raccoon", "a forgetful lighthouse keeper", "a tiny robot", "a shy dragon",
    "a grumpy cloud", "a brave dumpling", "a lost sock", "a retired circus bear",
    "a talkative teapot", "a homesick comet", "a snail with big dreams", "a beetle detective",
    "a grandmother inventor", "a pair of mismatched mittens", "a nervous ghost", "a jazz-loving octopus",
    "a mapmaker mouse", "a stubborn cactus", "a sleepy volcano", "a firefly who lost her glow",
    "a bookworm (a literal worm)", "a penguin who hates cold", "a knight who's afraid of the dark",
    "a origami crane come to life", "a street cat mayor", "a young witch's broom",
]
_SETTINGS = [
    "a floating night market", "the inside of a grandfather clock", "a desert made of sugar",
    "a library at the bottom of the sea", "a train that never stops", "a garden on the moon",
    "a city built on the back of a whale", "an abandoned carnival", "a village inside a teacup",
    "the last tree in a big city", "a bakery that opens only at midnight", "a snow globe",
    "a subway station between worlds", "a rooftop full of pigeons", "a cave of echoes",
    "a farm where the crops sing", "a mountain that sneezes", "a school for clumsy wizards",
]
_ENGINES = [
    "an unlikely friendship", "a small act of courage", "a misunderstanding that spirals",
    "a search for something lost", "learning to share a special gift", "a race against time",
    "swapping places with someone", "a promise that's hard to keep", "facing a private fear",
    "discovering a hidden talent", "fixing something you broke", "saying goodbye and hello",
    "a secret that wants to be told", "helping someone very different from you",
]


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

        # Sample 6 distinct anchors from each pool so every batch pulls in fresh
        # directions. A random nonce further discourages repeating prior batches.
        protagonists = random.sample(_PROTAGONISTS, 6)
        settings = random.sample(_SETTINGS, 6)
        engines = random.sample(_ENGINES, 6)
        anchors = "\n".join(
            f"  {i + 1}. loosely inspired by {protagonists[i]} · in/around {settings[i]} · centered on {engines[i]}"
            for i in range(6)
        )

        user_prompt = f"""\
Generate 6 story seed ideas for a children's book with these parameters:
- Age range: {age_range}
- Tone / themes: {tone_str}
- Target length: {page_count} pages

Use these as LOOSE inspiration — one nudge per seed, to keep the six ideas pulling in
genuinely different directions. Reinterpret them freely; do not copy them literally, and
never mention this list:
{anchors}

Hard requirements:
- All 6 seeds must be wildly different from each other in protagonist, setting, and premise.
- Avoid the tired defaults you tend to reach for (a shy creature who finds confidence, a
  lost toy finding its way home, a star/cloud that feels lonely) unless you give it a
  genuinely fresh twist.
- Make each hook specific, surprising, and irresistible to a child at a bookshelf.

(diversity token: {uuid.uuid4().hex[:8]})
"""
        return await self._client.generate(
            prompt=user_prompt,
            schema=BrainstormResult,
            system=BRAINSTORM_PROMPT,
            model=self._model,
            temperature=1.0,
        )


class ExpandStage:
    """Expands a user's prompt into a rich story concept."""

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
- Themes: {tone_str}
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
