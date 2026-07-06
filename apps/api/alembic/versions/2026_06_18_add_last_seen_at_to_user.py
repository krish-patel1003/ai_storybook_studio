"""add last_seen_at to user

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-18

"""
from typing import Sequence, Union
from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE
    """)
    op.execute('CREATE INDEX IF NOT EXISTS ix_user_last_seen_at ON "user" (last_seen_at)')


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS ix_user_last_seen_at')
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS last_seen_at')
