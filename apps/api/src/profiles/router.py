import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_user
from src.auth.models import User
from src.database import get_db
from src.profiles import service
from src.profiles.schemas import CreateProfileIn, ProfileOut, UpdateProfileIn

router = APIRouter()


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
