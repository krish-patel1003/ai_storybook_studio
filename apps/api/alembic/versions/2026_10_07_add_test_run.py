"""add test_run table (admin load-test results)

Revision ID: 0036
Revises: 0035
Create Date: 2026-10-07

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0036"
down_revision: Union[str, None] = "0035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS test_run (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            label VARCHAR(200) NOT NULL DEFAULT 'load test',
            summary JSONB NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_test_run_created_at ON test_run (created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS test_run")
