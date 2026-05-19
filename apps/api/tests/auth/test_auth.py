import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RefreshToken, User
from src.auth.utils import hash_password


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient, fake_user_data: dict):
    resp = await client.post("/auth/register", json=fake_user_data)
    assert resp.status_code == 201

    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["user"]["email"] == fake_user_data["email"]
    assert body["user"]["pen_name"] == fake_user_data["pen_name"]


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient, fake_user_data: dict):
    await client.post("/auth/register", json=fake_user_data)
    resp = await client.post("/auth/register", json=fake_user_data)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_register_invalid_email(client: AsyncClient):
    resp = await client.post(
        "/auth/register",
        json={"pen_name": "Author", "email": "not-an-email", "password": "SecurePass1"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, fake_user_data: dict, db: AsyncSession):
    # Seed a user directly
    user = User(
        pen_name=fake_user_data["pen_name"],
        email=fake_user_data["email"],
        password_hash=hash_password(fake_user_data["password"]),
    )
    db.add(user)
    await db.commit()

    resp = await client.post(
        "/auth/login",
        json={"email": fake_user_data["email"], "password": fake_user_data["password"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["user"]["email"] == fake_user_data["email"]


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, fake_user_data: dict, db: AsyncSession):
    user = User(
        pen_name=fake_user_data["pen_name"],
        email=fake_user_data["email"],
        password_hash=hash_password(fake_user_data["password"]),
    )
    db.add(user)
    await db.commit()

    resp = await client.post(
        "/auth/login",
        json={"email": fake_user_data["email"], "password": "WrongPassword1"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_success(client: AsyncClient, fake_user_data: dict):
    register_resp = await client.post("/auth/register", json=fake_user_data)
    refresh_token = register_resp.json()["refresh_token"]

    resp = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    # New refresh token must differ (rotation)
    assert body["refresh_token"] != refresh_token


@pytest.mark.asyncio
async def test_refresh_replayed_token_rejected(client: AsyncClient, fake_user_data: dict):
    register_resp = await client.post("/auth/register", json=fake_user_data)
    original_token = register_resp.json()["refresh_token"]

    # Use it once (rotates)
    await client.post("/auth/refresh", json={"refresh_token": original_token})

    # Replay the old token — must be rejected
    resp = await client.post("/auth/refresh", json={"refresh_token": original_token})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, fake_user_data: dict):
    register_resp = await client.post("/auth/register", json=fake_user_data)
    refresh_token = register_resp.json()["refresh_token"]
    access_token = register_resp.json()["access_token"]

    resp = await client.post(
        "/auth/logout",
        json={"refresh_token": refresh_token},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_me_requires_auth(client: AsyncClient):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_user(client: AsyncClient, fake_user_data: dict):
    register_resp = await client.post("/auth/register", json=fake_user_data)
    access_token = register_resp.json()["access_token"]

    resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == fake_user_data["email"]
