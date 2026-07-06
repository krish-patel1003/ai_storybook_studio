"""add email verification fields to user

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-15

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "is_email_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "user",
        sa.Column("email_verification_token", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "user",
        sa.Column(
            "email_verification_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_user_email_verification_token",
        "user",
        ["email_verification_token"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_user_email_verification_token", table_name="user")
    op.drop_column("user", "email_verification_expires_at")
    op.drop_column("user", "email_verification_token")
    op.drop_column("user", "is_email_verified")
