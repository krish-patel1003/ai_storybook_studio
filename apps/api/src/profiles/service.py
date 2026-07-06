import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import NotFoundError
from src.profiles.models import ChildProfile
from src.profiles.schemas import CreateProfileIn, UpdateProfileIn


async def list_profiles(db: AsyncSession, user_id: uuid.UUID) -> list[ChildProfile]:
    result = await db.execute(
        select(ChildProfile)
        .where(ChildProfile.user_id == user_id)
        .order_by(ChildProfile.created_at)
    )
    return list(result.scalars().all())


async def get_profile(db: AsyncSession, profile_id: uuid.UUID, user_id: uuid.UUID) -> ChildProfile:
    result = await db.execute(
        select(ChildProfile).where(ChildProfile.id == profile_id, ChildProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise NotFoundError("Child profile not found")
    return profile


async def create_profile(db: AsyncSession, user_id: uuid.UUID, data: CreateProfileIn) -> ChildProfile:
    profile = ChildProfile(user_id=user_id, **data.model_dump())
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


async def update_profile(
    db: AsyncSession, profile_id: uuid.UUID, user_id: uuid.UUID, data: UpdateProfileIn
) -> ChildProfile:
    profile = await get_profile(db, profile_id, user_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


async def delete_profile(db: AsyncSession, profile_id: uuid.UUID, user_id: uuid.UUID) -> None:
    profile = await get_profile(db, profile_id, user_id)
    await db.delete(profile)
    await db.commit()
