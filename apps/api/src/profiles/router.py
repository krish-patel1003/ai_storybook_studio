import base64
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_user
from src.auth.models import User
from src.database import get_db
from src.profiles import service
from src.profiles.schemas import (
    CreateProfileIn,
    GenerateAvatarIn,
    GenerateAvatarOut,
    ProfileOut,
    UpdateProfileIn,
)

router = APIRouter()


@router.get("/avatar-image")
async def get_avatar_image(key: str = Query(...)) -> Response:
    if not key.startswith("avatars/"):
        raise HTTPException(status_code=404, detail="Not found")
    from src.storage import minio_client as mc
    try:
        data, mime_type = mc.download(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Avatar not found")
    return Response(content=data, media_type=mime_type or "image/png")


@router.post("/generate-avatar", response_model=GenerateAvatarOut)
async def generate_avatar(
    data: GenerateAvatarIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> GenerateAvatarOut:
    from src.billing.guards import check_avatar_quota
    # Enforce the per-period avatar allowance (free 1 / storyteller 2 / studio 3).
    # Quota is only consumed after a successful generation, below.
    await check_avatar_quota(db, user)

    from google import genai
    from google.genai import types as gtypes
    from src.config import settings
    from src.storage import minio_client as mc

    full_prompt = (
        f"A cute cartoon avatar portrait of: {data.prompt}. "
        "Children's book illustration style. Square composition, centered face or character, "
        "friendly and approachable, colorful, bold outlines, plain solid-color background. "
        "No text, no watermarks."
    )

    import asyncio
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    try:
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model="gemini-3-pro-image",
                contents=full_prompt,
                config=gtypes.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                ),
            ),
            timeout=90,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Avatar generation timed out — the AI took too long to respond. Please try again.",
        )
    except Exception as exc:
        err_str = str(exc).lower()
        if "429" in err_str or "quota" in err_str or "rate" in err_str:
            raise HTTPException(
                status_code=429,
                detail="Image generation quota exceeded — please wait a minute and try again.",
            )
        raise HTTPException(
            status_code=503,
            detail="AI image service is temporarily unavailable — please try again in a moment.",
        )

    # Check for prompt-level or candidate-level safety blocks
    _SAFETY_DETAIL = (
        "Your description was blocked by the content safety filter. "
        "Avoid using names of real people, celebrities, or trademarked characters "
        "(e.g. Disney, Pixar, Marvel). Instead describe the character's appearance — "
        "for example: 'a small girl with curly red hair and a green dress'."
    )
    if not response.candidates:
        raise HTTPException(status_code=422, detail=_SAFETY_DETAIL)

    finish_reason = str(getattr(response.candidates[0], "finish_reason", ""))
    if "SAFETY" in finish_reason.upper():
        raise HTTPException(status_code=422, detail=_SAFETY_DETAIL)

    image_bytes: bytes | None = None
    mime_type = "image/png"
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.data:
            raw = part.inline_data.data
            image_bytes = base64.b64decode(raw) if isinstance(raw, str) else raw
            mime_type = part.inline_data.mime_type or "image/png"
            break

    if not image_bytes:
        raise HTTPException(
            status_code=422,
            detail="The AI couldn't generate an image for that description — try adding more visual detail or using a different style.",
        )

    ext = "jpg" if "jpeg" in mime_type else "png"
    filename = f"{uuid.uuid4()}.{ext}"
    key = mc.upload_avatar(str(user.id), filename, image_bytes, mime_type)

    from src.generation.events import log_event, set_context
    set_context(user.id)
    log_event("avatar", "gemini-3-pro-image", image_count=1)

    # Record the successful generation against the user's monthly allowance.
    from src.billing.guards import consume_avatar
    await consume_avatar(db, user)
    try:
        from src.metrics import record_avatar_generated
        record_avatar_generated()
    except Exception:
        pass

    url = f"{settings.API_URL}/profiles/avatar-image?key={key}"
    return GenerateAvatarOut(url=url)


@router.get("", response_model=list[ProfileOut])
async def list_profiles(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[ProfileOut]:
    profiles = await service.list_profiles(db, user.id)
    return [ProfileOut.model_validate(p) for p in profiles]


@router.post("", response_model=ProfileOut, status_code=status.HTTP_201_CREATED)
async def create_profile(
    data: CreateProfileIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> ProfileOut:
    profile = await service.create_profile(db, user.id, data)
    return ProfileOut.model_validate(profile)


@router.get("/{profile_id}", response_model=ProfileOut)
async def get_profile(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> ProfileOut:
    profile = await service.get_profile(db, profile_id, user.id)
    return ProfileOut.model_validate(profile)


@router.patch("/{profile_id}", response_model=ProfileOut)
async def update_profile(
    profile_id: uuid.UUID,
    data: UpdateProfileIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> ProfileOut:
    profile = await service.update_profile(db, profile_id, user.id, data)
    return ProfileOut.model_validate(profile)


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> None:
    await service.delete_profile(db, profile_id, user.id)
