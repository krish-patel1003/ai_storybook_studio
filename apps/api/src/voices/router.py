"""
Voice profile endpoints — lets users record their own voice and use it to narrate books.

POST  /voices/upload          — upload audio sample → clone via ElevenLabs → return profile
GET   /voices                 — list all profiles for the current user
DELETE /voices/{profile_id}   — delete profile (removes from ElevenLabs + MinIO + DB)
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_user
from src.auth.models import User
from src.database import get_db
from src.voices.models import VoiceProfile

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Response schema ───────────────────────────────────────────────────────────

class VoiceProfileOut(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=VoiceProfileOut, status_code=status.HTTP_201_CREATED)
async def upload_voice(
    file: Annotated[UploadFile, File(description="Audio recording (WebM/WAV/MP3)")],
    name: Annotated[str, Form(description="Name for this voice, e.g. Mom's Voice")],
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> VoiceProfileOut:
    """
    Upload a voice sample and create an ElevenLabs Instant Voice Clone.

    The audio must be at least 30 seconds long; 60–90 seconds gives best quality.
    Accepts WebM (from browser MediaRecorder), WAV, or MP3.
    """
    from src.generation.elevenlabs import clone_voice
    from src.storage import minio_client as mc

    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Voice name cannot be empty")

    audio_bytes = await file.read()
    if len(audio_bytes) < 1024:  # sanity check: at least 1 KB
        raise HTTPException(status_code=400, detail="Audio file is too small — please record at least 30 seconds")

    mime_type = file.content_type or "audio/webm"

    # 1. Clone the voice on ElevenLabs
    try:
        elevenlabs_voice_id = await clone_voice(name.strip(), audio_bytes, mime_type)
    except RuntimeError as exc:
        logger.error("Voice clone failed for user %s: %s", user.id, exc)
        raise HTTPException(status_code=502, detail=str(exc))

    # 2. Store the raw sample in MinIO (useful for debugging / re-cloning)
    profile_id = uuid.uuid4()
    sample_key = mc.upload_voice_sample(str(user.id), str(profile_id), audio_bytes, mime_type)

    # 3. Save profile to DB
    profile = VoiceProfile(
        id=profile_id,
        user_id=user.id,
        name=name.strip(),
        elevenlabs_voice_id=elevenlabs_voice_id,
        sample_key=sample_key,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    logger.info(
        "Created voice profile '%s' (id=%s) for user %s",
        profile.name,
        profile.id,
        user.id,
    )
    return VoiceProfileOut.model_validate(profile)


@router.get("", response_model=list[VoiceProfileOut])
async def list_voices(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> list[VoiceProfileOut]:
    """Return all voice profiles belonging to the current user, newest first."""
    result = await db.execute(
        select(VoiceProfile)
        .where(VoiceProfile.user_id == user.id)
        .order_by(VoiceProfile.created_at.desc())
    )
    profiles = result.scalars().all()
    return [VoiceProfileOut.model_validate(p) for p in profiles]


@router.get("/{profile_id}/sample")
async def stream_voice_sample(
    profile_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> Response:
    """Stream the raw audio recording for a voice profile."""
    from src.storage import minio_client as mc

    profile = await db.get(VoiceProfile, profile_id)
    if profile is None or profile.user_id != user.id:
        raise HTTPException(status_code=404, detail="Voice profile not found")

    try:
        data, content_type = mc.download(profile.sample_key)
    except Exception:
        raise HTTPException(status_code=404, detail="Audio sample not found in storage")

    return Response(
        content=data,
        media_type=content_type or "audio/webm",
        headers={"Cache-Control": "no-cache"},
    )


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_voice(
    profile_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> Response:
    """
    Delete a voice profile.
    Removes the ElevenLabs clone, the MinIO sample, and the DB record.
    """
    from src.generation.elevenlabs import delete_voice as el_delete
    from src.storage import minio_client as mc

    profile = await db.get(VoiceProfile, profile_id)
    if profile is None or profile.user_id != user.id:
        raise HTTPException(status_code=404, detail="Voice profile not found")

    # Delete from ElevenLabs (non-fatal)
    await el_delete(profile.elevenlabs_voice_id)

    # Delete raw sample from MinIO (non-fatal)
    mc.delete_voice_sample(profile.sample_key)

    # Delete from DB
    await db.delete(profile)
    await db.commit()
    logger.info("Deleted voice profile id=%s for user %s", profile_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
