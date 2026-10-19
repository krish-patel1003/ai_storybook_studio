"""add purchase table (billing history for the account page)

Revision ID: 0038
Revises: 0037
Create Date: 2026-10-14

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0038"
down_revision: Union[str, None] = "0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS purchase (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            kind VARCHAR(20) NOT NULL,
            description VARCHAR(120) NOT NULL,
            amount_cents INTEGER NOT NULL DEFAULT 0,
            currency VARCHAR(8) NOT NULL DEFAULT 'usd',
            tier VARCHAR(32),
            pages INTEGER,
            stripe_id VARCHAR(80) UNIQUE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_purchase_user_id ON purchase (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_purchase_created_at ON purchase (created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS purchase")
