"""widen avatar_emoji to text

Revision ID: 2026_07_02_widen_avatar_emoji
Revises: 2026_06_30_clean_newlines_in_page_text
Create Date: 2026-07-02
"""

from alembic import op
import sqlalchemy as sa

revision = "2026_07_02_widen_avatar_emoji"
down_revision = "2026_06_30_clean_newlines_in_page_text"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "child_profile",
        "avatar_emoji",
        existing_type=sa.String(10),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "child_profile",
        "avatar_emoji",
        existing_type=sa.Text(),
        type_=sa.String(10),
        existing_nullable=False,
    )
