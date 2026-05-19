"""create book tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-18

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TYPE generation_stage AS ENUM (
            'pending', 'enhancing', 'characters', 'outline', 'pages', 'complete', 'failed'
        )
    """)

    op.execute("""
        CREATE TABLE book (
            id          UUID PRIMARY KEY,
            user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            title       VARCHAR(255) NOT NULL,
            raw_prompt  TEXT NOT NULL,
            age_range   VARCHAR(10) NOT NULL,
            tone        JSONB NOT NULL DEFAULT '[]',
            art_style   VARCHAR(100) NOT NULL,
            safety_mode BOOLEAN NOT NULL DEFAULT TRUE,
            page_count  INTEGER NOT NULL,
            brief       JSONB,
            stage       generation_stage NOT NULL DEFAULT 'pending',
            error       TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_book_user_id ON book(user_id)")
    op.execute("CREATE INDEX ix_book_stage ON book(stage)")

    op.execute("""
        CREATE TABLE character (
            id                  UUID PRIMARY KEY,
            book_id             UUID NOT NULL REFERENCES book(id) ON DELETE CASCADE,
            name                VARCHAR(100) NOT NULL,
            is_protagonist      BOOLEAN NOT NULL DEFAULT FALSE,
            role_description    TEXT NOT NULL,
            personality         TEXT NOT NULL,
            visual_anchors      JSONB NOT NULL,
            illustration_prompt TEXT NOT NULL,
            CONSTRAINT uq_character_book_name UNIQUE (book_id, name)
        )
    """)
    op.execute("CREATE INDEX ix_character_book_id ON character(book_id)")

    op.execute("""
        CREATE TABLE page (
            id                     UUID PRIMARY KEY,
            book_id                UUID NOT NULL REFERENCES book(id) ON DELETE CASCADE,
            "order"                INTEGER NOT NULL,
            is_cover               BOOLEAN NOT NULL DEFAULT FALSE,
            is_locked              BOOLEAN NOT NULL DEFAULT FALSE,
            narrative_role         VARCHAR(100) NOT NULL,
            beat                   TEXT NOT NULL,
            emotional_note         TEXT NOT NULL,
            characters_present     JSONB NOT NULL DEFAULT '[]',
            setting_note           TEXT NOT NULL,
            text                   TEXT,
            word_count             INTEGER,
            illustration_metadata  JSONB,
            CONSTRAINT uq_page_book_order UNIQUE (book_id, "order")
        )
    """)
    op.execute("CREATE INDEX ix_page_book_id ON page(book_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS page")
    op.execute("DROP TABLE IF EXISTS character")
    op.execute("DROP TABLE IF EXISTS book")
    op.execute("DROP TYPE IF EXISTS generation_stage")
