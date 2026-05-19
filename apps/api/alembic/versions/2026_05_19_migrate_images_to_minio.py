"""migrate image storage from bytea columns to minio image_key

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-19

"""

from typing import Sequence, Union
from alembic import op


revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS image_data")
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS image_mime")
    op.execute("ALTER TABLE page ADD COLUMN IF NOT EXISTS image_key VARCHAR(255)")


def downgrade() -> None:
    op.execute("ALTER TABLE page DROP COLUMN IF EXISTS image_key")
    op.execute("ALTER TABLE page ADD COLUMN IF NOT EXISTS image_data bytea")
    op.execute("ALTER TABLE page ADD COLUMN IF NOT EXISTS image_mime VARCHAR(50)")
