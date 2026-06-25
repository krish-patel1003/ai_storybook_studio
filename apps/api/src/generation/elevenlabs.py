"""
ElevenLabs Instant Voice Cloning + TTS client.

Uses httpx (already a project dependency) — no extra SDK needed.

Workflow:
  1. clone_voice(name, audio_bytes)  →  elevenlabs_voice_id (str)
  2. synthesize(text, voice_id)      →  WAV bytes  (runs TTS annotator first)
  3. delete_voice(voice_id)          →  cleanup when profile is deleted
"""
from __future__ import annotations

import io
import logging
import wave

import httpx

logger = logging.getLogger(__name__)

_BASE = "https://api.elevenlabs.io/v1"
_TTS_MODEL = "eleven_turbo_v2_5"  # Newer turbo — better expressiveness at same price point
_PCM_SAMPLE_RATE = 22_050         # Must match the output_format query param below
_PCM_OUTPUT_FORMAT = "pcm_22050"  # Raw signed-16-bit PCM — no decoding library needed

# ── Voice settings ────────────────────────────────────────────────────────────
# stability   : 0.0–1.0  lower = more expressive / variable delivery
# similarity  : 0.0–1.0  how closely the output stays true to the cloned voice
# style       : 0.0–1.0  stylisation / character exaggeration (0 = neutral)
# speaker boost: sharpens speaker clarity against background noise
_VOICE_SETTINGS = {
    "stability": 0.28,          # expressive, varied delivery (was 0.5 — flat/monotone)
    "similarity_boost": 0.82,   # stay faithful to the cloned voice identity
    "style": 0.50,              # noticeable character/emotion in the reading
    "use_speaker_boost": True,
}

# ── TTS annotation prompt ─────────────────────────────────────────────────────
_ANNOTATE_SYSTEM = """\
You are a voice director preparing children's book text for text-to-speech narration.
Your job is to annotate the text so that an AI narrator sounds warm, expressive, \
and engaging — exactly like a parent reading a bedtime story.

You have four tools. Use them sparingly and only where they genuinely help:

1. ALL CAPS on a single important word → the narrator emphasises it.
   Use for: the most emotionally charged word in a sentence, a sound effect word,
   a key character name at a dramatic moment.
   Example: "She ran SO fast her hat flew off."
   Limit: 1–2 caps words per page. Never cap whole phrases.

2. Ellipsis (…) → the narrator pauses, leans in, builds suspense.
   Use for: a beat before a reveal, a moment of wonder, a dramatic silence.
   Example: "She opened the lid… and gasped."
   Limit: 1–2 per page. Never use mid-sentence unless it trails off.

3. Exclamation marks → rising energy and excitement.
   Already in the text = keep. Add one only if a sentence clearly calls for it.
   Limit: do not increase the exclamation count by more than one per page.

4. Question marks → rising intonation.
   Already in the text = keep. Do not add questions that aren't there.

RULES:
- Change ONLY punctuation and capitalisation. Do not rephrase, add, or remove any words.
- Output ONLY the annotated text. No explanation, no quotes around the result.
- If the text is already perfectly expressive, return it unchanged.
- Cover pages (title only) → return unchanged.
"""

_ANNOTATE_AGE_HINTS = {
    "3-5":  "This is a toddler book. Lean into sound effects. One big dramatic pause max.",
    "6-8":  "Parent read-aloud. Warm and playful. Emphasis on funny and surprising moments.",
    "9-11": "Older reader. Precise, slightly wry. Emphasis on tension and character voice.",
}


def _api_key() -> str:
    from src.config import settings
    key = settings.ELEVENLABS_API_KEY
    if not key:
        raise ValueError("ELEVENLABS_API_KEY is not configured")
    return key


def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int = _PCM_SAMPLE_RATE) -> bytes:
    """Wrap raw signed-16-bit PCM bytes in a WAV container (no external libs needed)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)   # mono
        wf.setsampwidth(2)   # 16-bit = 2 bytes
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    buf.seek(0)
    return buf.read()


async def _annotate_for_tts(text: str, age_range: str) -> str:
    """
    Run a fast Gemini Flash call to add intonation/emphasis cues that ElevenLabs
    responds to: strategic ALLCAPS, ellipsis pauses, tuned punctuation.

    Falls back to the original text if the LLM call fails or returns garbage.
    """
    from pydantic import BaseModel as _BaseModel
    from src.generation.gemini import GeminiClient
    from src.config import settings

    class _AnnotatedText(_BaseModel):
        text: str

    try:
        client = GeminiClient(api_key=settings.GEMINI_API_KEY)
        age_hint = _ANNOTATE_AGE_HINTS.get(age_range, _ANNOTATE_AGE_HINTS["6-8"])

        result = await client.generate(
            prompt=f"Age group: {age_range}. Hint: {age_hint}\n\nTEXT TO ANNOTATE:\n{text}",
            schema=_AnnotatedText,
            system=_ANNOTATE_SYSTEM,
            model="gemini-3.5-flash",
            temperature=0.3,
        )
        annotated = result.text.strip()

        # Sanity: if the LLM added or removed large amounts of words, fall back
        original_words = len(text.split())
        annotated_words = len(annotated.split())
        if not annotated or annotated_words > original_words * 1.3 or annotated_words < original_words * 0.7:
            logger.warning(
                "TTS annotator returned unexpected length (%d→%d words) — using original",
                original_words, annotated_words,
            )
            return text

        logger.debug("TTS annotation: %d chars → %d chars", len(text), len(annotated))
        return annotated

    except Exception as exc:
        logger.warning("TTS annotation failed (non-fatal): %s — using original text", exc)
        return text


async def clone_voice(name: str, audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
    """
    Upload a voice sample to ElevenLabs Instant Voice Cloning.

    Returns:
        The ElevenLabs voice_id string — store this in VoiceProfile.elevenlabs_voice_id
    """
    ext_map = {
        "audio/webm": "webm",
        "audio/wav":  "wav",
        "audio/mp3":  "mp3",
        "audio/mpeg": "mp3",
        "audio/ogg":  "ogg",
    }
    ext = ext_map.get(mime_type.split(";")[0].strip(), "webm")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{_BASE}/voices/add",
            headers={"xi-api-key": _api_key()},
            data={
                "name": name,
                "description": f"Cloned voice: {name}",
            },
            files={
                "files": (f"sample.{ext}", audio_bytes, mime_type),
            },
        )

    if response.status_code != 200:
        logger.error("ElevenLabs clone_voice failed: status=%d body=%s", response.status_code, response.text[:500])
        raise RuntimeError(f"Voice cloning failed (HTTP {response.status_code}): {response.text[:200]}")

    voice_id: str = response.json()["voice_id"]
    logger.info("ElevenLabs: cloned voice '%s' → voice_id=%s", name, voice_id)
    return voice_id


async def synthesize(text: str, voice_id: str, age_range: str = "6-8") -> bytes:
    """
    Generate expressive WAV audio from text using a cloned ElevenLabs voice.

    Steps:
      1. Annotate the text with intonation/emphasis cues via Gemini Flash
      2. Send to ElevenLabs with expressive voice settings
      3. Wrap PCM output in a WAV container

    Args:
        text:      Page text to narrate
        voice_id:  ElevenLabs voice_id from clone_voice()
        age_range: Story age group — "3-5", "6-8", or "9-11" — guides annotation tone
    """
    # Step 1: annotate for expressive delivery
    annotated_text = await _annotate_for_tts(text, age_range)

    payload = {
        "text": annotated_text,
        "model_id": _TTS_MODEL,
        "voice_settings": _VOICE_SETTINGS,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{_BASE}/text-to-speech/{voice_id}",
            params={"output_format": _PCM_OUTPUT_FORMAT},  # MUST be query param
            headers={
                "xi-api-key": _api_key(),
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code != 200:
        logger.error("ElevenLabs synthesize failed: status=%d body=%s", response.status_code, response.text[:500])
        raise RuntimeError(f"ElevenLabs TTS failed (HTTP {response.status_code}): {response.text[:200]}")

    pcm_bytes = response.content
    logger.info("ElevenLabs TTS: voice_id=%s  pcm_size=%d bytes  annotated=%r", voice_id, len(pcm_bytes), annotated_text[:80])
    return _pcm_to_wav(pcm_bytes)


async def delete_voice(voice_id: str) -> None:
    """
    Delete a cloned voice from ElevenLabs.
    Logs and swallows errors so a missing voice doesn't break anything.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.delete(
                f"{_BASE}/voices/{voice_id}",
                headers={"xi-api-key": _api_key()},
            )
        if response.status_code not in (200, 204):
            logger.warning("ElevenLabs delete_voice returned %d for voice_id=%s", response.status_code, voice_id)
        else:
            logger.info("ElevenLabs: deleted voice_id=%s", voice_id)
    except Exception as exc:
        logger.warning("ElevenLabs delete_voice failed (non-fatal): %s", exc)
