"""
MinIO client — thin async-friendly wrapper around the minio SDK.

Images are stored as:  illustrations/<book_id>/<page_id>.png
"""

import io
import logging
from functools import lru_cache

from minio import Minio
from minio.error import S3Error

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _client() -> Minio:
    from src.config import settings
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )


def ensure_bucket() -> None:
    from src.config import settings
    client = _client()
    bucket = settings.MINIO_BUCKET
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
        logger.info("Created MinIO bucket: %s", bucket)


def object_key(book_id: str, page_id: str) -> str:
    return f"{book_id}/{page_id}.png"


def upload_image(book_id: str, page_id: str, data: bytes, mime_type: str = "image/png") -> str:
    """Upload image bytes; returns the object key."""
    from src.config import settings
    ensure_bucket()
    key = object_key(book_id, page_id)
    _client().put_object(
        settings.MINIO_BUCKET,
        key,
        io.BytesIO(data),
        length=len(data),
        content_type=mime_type,
    )
    return key


def download_image(key: str) -> tuple[bytes, str]:
    """Download image; returns (bytes, content_type)."""
    from src.config import settings
    response = _client().get_object(settings.MINIO_BUCKET, key)
    try:
        data = response.read()
        content_type = response.headers.get("content-type", "image/png")
    finally:
        response.close()
        response.release_conn()
    return data, content_type


def delete_image(key: str) -> None:
    from src.config import settings
    try:
        _client().remove_object(settings.MINIO_BUCKET, key)
    except S3Error:
        pass
