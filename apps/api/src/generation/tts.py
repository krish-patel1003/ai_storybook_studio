"""Text-to-speech via Gemini TTS.

WAV generation mirrors the working Colab approach:
  np.frombuffer(audio_bytes, dtype=np.int16)  →  sf.write(buf, array, 24000)
"""
from __future__ import annotations

import asyncio
import io
import logging

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

_MODEL = "gemini-3.1-flash-tts-preview"
_SAMPLE_RATE = 24_000  # Hz — Gemini TTS output rate

# Available voices with descriptions
AVAILABLE_VOICES: dict[str, str] = {
    "Kore":   "Warm & expressive — classic narrator",
    "Puck":   "Upbeat & playful — great for fun stories",
    "Aoede":  "Breezy & light — gentle, soothing",
    "Leda":   "Youthful & bright — sounds like a child",
    "Zephyr": "Clear & bright — crisp storytelling",
}
DEFAULT_VOICE = "Kore"


def _pcm_to_wav(pcm_bytes: bytes) -> bytes:
    """Convert raw int16 PCM bytes to a WAV file (same as the Colab snippet)."""
    audio_array = np.frombuffer(pcm_bytes, dtype=np.int16)
    buf = io.BytesIO()
    sf.write(buf, audio_array, _SAMPLE_RATE, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return buf.read()


def _synthesize_sync(text: str, api_key: str, voice_name: str = DEFAULT_VOICE, save_raw_key: str | None = None) -> bytes:
    from google import genai
    from google.genai import types

    if voice_name not in AVAILABLE_VOICES:
        voice_name = DEFAULT_VOICE

    client = genai.Client(api_key=api_key, vertexai=False)
    response = client.models.generate_content(
        model=_MODEL,
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=voice_name,
                    )
                )
            ),
        ),
    )

    part = response.candidates[0].content.parts[0]
    pcm_bytes: bytes = part.inline_data.data

    logger.info(
        "TTS: mime_type=%s  pcm_size=%d bytes  estimated_duration=%.2fs",
        part.inline_data.mime_type,
        len(pcm_bytes),
        len(pcm_bytes) / (_SAMPLE_RATE * 2),
    )

    # Optionally store raw PCM to MinIO for debugging
    if save_raw_key:
        try:
            from src.config import settings
            from src.storage import minio_client as mc
            mc.ensure_bucket()
            mc._client().put_object(
                settings.MINIO_BUCKET,
                save_raw_key,
                io.BytesIO(pcm_bytes),
                length=len(pcm_bytes),
                content_type="application/octet-stream",
            )
            logger.info("TTS debug: raw PCM saved → %s (%d bytes)", save_raw_key, len(pcm_bytes))
        except Exception as exc:
            logger.warning("TTS debug: failed to save raw PCM: %s", exc)

    return _pcm_to_wav(pcm_bytes)


async def synthesize(text: str, voice_name: str = DEFAULT_VOICE, debug_raw_key: str | None = None) -> bytes:
    """Generate WAV audio for *text* using Gemini TTS. Returns WAV bytes."""
    from src.config import settings
    return await asyncio.to_thread(_synthesize_sync, text, settings.GEMINI_API_KEY, voice_name, debug_raw_key)
