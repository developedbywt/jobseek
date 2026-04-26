"""Add company_description table (Supabase mirror for local/self-hosted deployments).

Revision ID: 0006
Down Revision: 0004
Create Date: 2026-04-26
"""

from __future__ import annotations

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS company_description (
            company_id  UUID        NOT NULL REFERENCES company(id) ON DELETE CASCADE,
            locale      TEXT        NOT NULL DEFAULT 'en',
            description TEXT        NOT NULL,
            PRIMARY KEY (company_id, locale)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS company_description")
