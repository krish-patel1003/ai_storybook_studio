"""rename pen_name to username, add author_name to user/child_profile/book

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-24

"""
from typing import Sequence, Union
from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename pen_name → username on user table
    op.execute('ALTER TABLE "user" RENAME COLUMN pen_name TO username')
    # Add author_name to user (copy from username as default)
    op.execute('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS author_name VARCHAR(100) DEFAULT NULL')
    op.execute('UPDATE "user" SET author_name = username WHERE author_name IS NULL')

    # Add author_name to child_profile
    op.execute("ALTER TABLE child_profile ADD COLUMN IF NOT EXISTS author_name VARCHAR(100) DEFAULT NULL")

    # Add author_name to book (resolved at creation time)
    op.execute("ALTER TABLE book ADD COLUMN IF NOT EXISTS author_name VARCHAR(100) DEFAULT NULL")


def downgrade() -> None:
    op.execute('ALTER TABLE book DROP COLUMN IF EXISTS author_name')
    op.execute('ALTER TABLE child_profile DROP COLUMN IF EXISTS author_name')
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS author_name')
    op.execute('ALTER TABLE "user" RENAME COLUMN username TO pen_name')
