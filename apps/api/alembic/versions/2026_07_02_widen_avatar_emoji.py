"""widen avatar_emoji to text

Revision ID: 0021
Revises: 0020
Create Date: 2026-07-02
"""

from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = "0021"
down_revision: Union[str, None] = "0020"
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
