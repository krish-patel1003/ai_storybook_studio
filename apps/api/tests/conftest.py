from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.auth.dependencies import current_user, parse_jwt_data
from src.auth.models import User
from src.database import get_db
from src.main import app
from src.models import metadata

# In-memory SQLite for tests (fast, no external dependency)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
test_session_maker = async_sessionmaker(test_engine, expire_on_commit=False)


@pytest.fixture(autouse=True, scope="session")
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(metadata.drop_all)


@pytest.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    async with test_session_maker() as session:
        yield session


@pytest.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_db] = lambda: db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def fake_user_data() -> dict:
    return {
        "pen_name": "Test Author",
        "email": "test@example.com",
        "password": "SecurePass1",
    }


@pytest.fixture
def override_current_user():
    """Override JWT auth with a pre-built fake user for unit tests."""

    def _override(user: User):
        app.dependency_overrides[parse_jwt_data] = lambda: {"sub": str(user.id)}
        app.dependency_overrides[current_user] = lambda: user

    yield _override
    app.dependency_overrides.clear()
