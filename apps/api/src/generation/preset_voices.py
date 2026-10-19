"""
Preset narration voices — now powered by ElevenLabs (replaces the old Gemini TTS
presets). Each entry's `id` IS the ElevenLabs voice_id, so narration routes
straight to ElevenLabs. Voice ids verified present on the account via
GET /v1/voices (see admin /elevenlabs-voices).
"""
from __future__ import annotations

PRESET_VOICES: list[dict] = [
    {
        "id": "JBFqnCBsd6RMkjVDRZzb",  # George
        "name": "George",
        "description": "Warm, captivating storyteller — storybooks & bedtime, all ages",
        "is_default": True,
    },
    {
        "id": "pFZP5JQG7iQjIQuC4Bku",  # Lily
        "name": "Lily",
        "description": "Soft, gentle British voice — bedtime stories, ages 3–8",
        "is_default": False,
    },
    {
        "id": "cgSgspJ2msm6clMCkdW9",  # Jessica
        "name": "Jessica",
        "description": "Playful, bright & warm — cheerful stories, ages 4–9",
        "is_default": False,
    },
    {
        "id": "Xb7hH8MSUJpSbSDYk0k2",  # Alice
        "name": "Alice",
        "description": "Clear, engaging British voice — adventures & fantasy, ages 6–12",
        "is_default": False,
    },
    {
        "id": "FGY2WhTYpPnrIDTdsKH5",  # Laura
        "name": "Laura",
        "description": "Upbeat & quirky — animated and playful stories",
        "is_default": False,
    },
    {
        "id": "N2lVS1w4EtoT3dr4eOWO",  # Callum
        "name": "Callum",
        "description": "Characterful & mischievous — funny stories & character voices",
        "is_default": False,
    },
    {
        "id": "cjVigY5qzO86Huf0OWal",  # Eric
        "name": "Eric",
        "description": "Smooth, trustworthy American male — educational & science adventures",
        "is_default": False,
    },
    {
        "id": "pqHfZKP75CvOlQylNhV4",  # Bill
        "name": "Bill",
        "description": "Wise, grandfatherly elder — fairy tales & magical fantasy",
        "is_default": False,
    },
]

PRESET_IDS: set[str] = {v["id"] for v in PRESET_VOICES}
DEFAULT_VOICE_ID: str = next(v["id"] for v in PRESET_VOICES if v["is_default"])


def resolve_preset(voice_name: str | None) -> tuple[str, str]:
    """Map an incoming preset id to a valid (voice_id, display_name).
    Falls back to the default voice for unknown/empty values (incl. legacy
    Gemini voice names like 'Kore')."""
    for v in PRESET_VOICES:
        if voice_name == v["id"]:
            return v["id"], v["name"]
    default = next(v for v in PRESET_VOICES if v["id"] == DEFAULT_VOICE_ID)
    return default["id"], default["name"]
