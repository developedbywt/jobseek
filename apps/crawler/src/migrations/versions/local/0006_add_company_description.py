"""Add company_description table (Supabase mirror for local/self-hosted deployments)."""

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
