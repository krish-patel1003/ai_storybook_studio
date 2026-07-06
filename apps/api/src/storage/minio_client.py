"""
GCS storage client — drop-in replacement for the previous MinIO wrapper.

Locally, MINIO_ENDPOINT is set to the local MinIO service so we keep the
MinIO SDK for local dev. In production (MINIO_ENDPOINT=storage.googleapis.com)
we use the native google-cloud-storage SDK with ADC (Application Default
Credentials — Cloud Run injects these automatically from the service account).
"""

import io
import logging
from functools import lru_cache

from minio.error import S3Error  # kept for callers that catch S3Error

logger = logging.getLogger(__name__)


def _is_gcs() -> bool:
    from src.config import settings
    return "googleapis.com" in settings.MINIO_ENDPOINT


# ── GCS backend ───────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _gcs_client():
    from google.cloud import storage  # type: ignore
    return storage.Client()


def _gcs_bucket():
    from src.config import settings
    return _gcs_client().bucket(settings.MINIO_BUCKET)


def _gcs_upload(key: str, data: bytes, mime_type: str) -> str:
    blob = _gcs_bucket().blob(key)
    blob.upload_from_file(io.BytesIO(data), content_type=mime_type)
    return key


def _gcs_download(key: str) -> tuple[bytes, str]:
    blob = _gcs_bucket().blob(key)
    data = blob.download_as_bytes()
    return data, blob.content_type or "application/octet-stream"


def _gcs_delete(key: str) -> None:
    try:
        _gcs_bucket().blob(key).delete()
    except Exception:
        pass


# ── MinIO backend (local dev) ─────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _minio_client():
    from minio import Minio
    from src.config import settings
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )


def _ensure_minio_bucket() -> None:
    from src.config import settings
    client = _minio_client()
    bucket = settings.MINIO_BUCKET
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
        logger.info("Created MinIO bucket: %s", bucket)


def _minio_upload(key: str, data: bytes, mime_type: str) -> str:
    from src.config import settings
    _ensure_minio_bucket()
    _minio_client().put_object(
        settings.MINIO_BUCKET, key, io.BytesIO(data), length=len(data), content_type=mime_type,
    )
    return key


def _minio_download(key: str) -> tuple[bytes, str]:
    from src.config import settings
    response = _minio_client().get_object(settings.MINIO_BUCKET, key)
    try:
        data = response.read()
        content_type = response.headers.get("content-type", "image/png")
    finally:
        response.close()
        response.release_conn()
    return data, content_type


def _minio_delete(key: str) -> None:
    from src.config import settings
    try:
        _minio_client().remove_object(settings.MINIO_BUCKET, key)
    except S3Error:
        pass


# ── Public API (same signatures as before) ────────────────────────────────────

def object_key(book_id: str, page_id: str) -> str:
    return f"{book_id}/{page_id}.png"


def character_key(book_id: str, character_id: str) -> str:
    return f"characters/{book_id}/{character_id}.png"


def audio_key(book_id: str, page_id: str) -> str:
    return f"audio/{book_id}/{page_id}.wav"


def voice_sample_key(user_id: str, profile_id: str) -> str:
    return f"voice-samples/{user_id}/{profile_id}.webm"


def upload_image(book_id: str, page_id: str, data: bytes, mime_type: str = "image/png") -> str:
    key = object_key(book_id, page_id)
    return upload(key, data, mime_type)


def download_image(key: str) -> tuple[bytes, str]:
    return download(key)


def delete_image(key: str) -> None:
    _gcs_delete(key) if _is_gcs() else _minio_delete(key)


def upload(key: str, data: bytes, mime_type: str = "image/png") -> str:
    return _gcs_upload(key, data, mime_type) if _is_gcs() else _minio_upload(key, data, mime_type)


def download(key: str) -> tuple[bytes, str]:
    return _gcs_download(key) if _is_gcs() else _minio_download(key)


def upload_audio(book_id: str, page_id: str, data: bytes) -> str:
    key = audio_key(book_id, page_id)
    return upload(key, data, "audio/wav")


def download_audio(key: str) -> bytes:
    data, _ = download(key)
    return data


def avatar_key(user_id: str, filename: str) -> str:
    return f"avatars/{user_id}/{filename}"


def upload_avatar(user_id: str, filename: str, data: bytes, mime_type: str = "image/png") -> str:
    key = avatar_key(user_id, filename)
    return upload(key, data, mime_type)


def upload_voice_sample(user_id: str, profile_id: str, data: bytes, mime_type: str = "audio/webm") -> str:
    key = voice_sample_key(user_id, profile_id)
    return upload(key, data, mime_type)


def delete_voice_sample(key: str) -> None:
    _gcs_delete(key) if _is_gcs() else _minio_delete(key)


# keep ensure_bucket as a no-op for GCS (bucket already exists)
def ensure_bucket() -> None:
    if not _is_gcs():
        _ensure_minio_bucket()
