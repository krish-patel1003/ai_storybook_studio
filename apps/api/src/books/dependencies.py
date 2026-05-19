import uuid

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import current_user as _auth_current_user
from src.auth.models import User
from src.books.models import Book
from src.books.service import get_book
from src.database import get_db


async def current_user(user: User = Depends(_auth_current_user)) -> User:
    return user


async def owned_book(
    book_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> Book:
    return await get_book(db, book_id, user.id)
