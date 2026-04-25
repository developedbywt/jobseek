"""Local-mode enrichment: filter candidates, sync Gemini enrichment, alert query."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Literal
from uuid import uuid4

import asyncpg
import structlog
import yaml
from pydantic import BaseModel, Field

log = structlog.get_logger()


# ── Filter config ──────────────────────────────────────────────────────


class RequireConfig(BaseModel):
    work_permit_support: Literal["yes", "no"] | None = "yes"
    experience_max: int | None = 2


class OutputConfig(BaseModel):
    limit: int = 100


class FilterConfig(BaseModel):
    exclude_title_patterns: list[str] = Field(default_factory=list)
    require: RequireConfig
    output: OutputConfig = Field(default_factory=OutputConfig)


def load_filter_config(path: str) -> FilterConfig:
    """Load and validate ai/filters.yaml. Raises FileNotFoundError or ValidationError."""
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return FilterConfig.model_validate(raw or {})


# ── Helpers ────────────────────────────────────────────────────────────


def _build_exclude_regex(patterns: list[str]) -> str:
    """Build a case-insensitive regex alternation from a list of patterns.

    Returns '(?!)' (matches nothing) when patterns is empty so SQL !~* is safe.
    """
    if not patterns:
        return "(?!)"
    return "|".join(patterns)


# ── Claim query (local mode — no R2 requirement) ───────────────────────

_CLAIM_PENDING_LOCAL = """
UPDATE job_posting
SET to_be_enriched = false
WHERE id IN (
    SELECT id FROM job_posting
    WHERE is_active = true
      AND to_be_enriched = true
      AND enrichment IS NULL
    ORDER BY first_seen_at DESC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
)
RETURNING id,
          titles[1]      AS title,
          locales[1]     AS locale,
          employment_type
"""


# ── mark-candidates ────────────────────────────────────────────────────


async def mark_candidates_from_yaml(pool: asyncpg.Pool, yaml_path: str) -> dict:
    """Flag postings that pass cheap filters as to_be_enriched=true.

    Step 1 — Reset all unenriched active postings to candidates.
    Step 2 — Clear the ones that fail title regex or experience cap.

    Returns {"marked": N, "cleared": M}.
    """
    config = load_filter_config(yaml_path)
    exclude_regex = _build_exclude_regex(config.exclude_title_patterns)
    experience_max = config.require.experience_max if config.require.experience_max is not None else 9999

    # Step 1: Reset (idempotent)
    reset_result = await pool.execute(
        "UPDATE job_posting SET to_be_enriched = true "
        "WHERE is_active = true AND enrichment IS NULL"
    )
    marked_count = int(reset_result.split()[-1])

    # Step 2: Clear those that fail cheap filters
    cleared_result = await pool.execute(
        """
        UPDATE job_posting
        SET to_be_enriched = false
        WHERE is_active = true
          AND enrichment IS NULL
          AND (
            (titles[1] IS NOT NULL AND titles[1] ~* $1)
            OR (experience_max IS NOT NULL AND experience_max > $2)
          )
        """,
        exclude_regex,
        experience_max,
    )
    cleared_count = int(cleared_result.split()[-1])

    log.info(
        "mark_candidates.done",
        marked=marked_count,
        cleared=cleared_count,
        exclude_regex=exclude_regex,
        experience_max=experience_max,
    )
    return {"marked": marked_count, "cleared": cleared_count}


# ── fetch HTML from local descriptions table ───────────────────────────


async def fetch_html_local(pool: asyncpg.Pool, posting_id: str, locale: str) -> str | None:
    """Fetch HTML from the local descriptions table."""
    return await pool.fetchval(
        "SELECT html FROM descriptions WHERE posting_id = $1::uuid AND locale = $2 LIMIT 1",
        posting_id,
        locale,
    )


# ── sync enrichment loop ───────────────────────────────────────────────


async def _process_enrichment_task(
    pool: asyncpg.Pool,
    provider,
    row: dict,
    semaphore: asyncio.Semaphore,
    rate_limiter: dict,
    system_prompt: str,
    enrichment_schema: dict,
) -> tuple[str, dict | None, object | None, str]:
    """Process a single row enrichment with semaphore and rate-limit coordination.

    Returns (posting_id, parsed_dict or None, usage or None, outcome).
    Outcome: "success", "no_html", or "api_error".
    """
    from src.core.enrich.job import build_user_message

    pid = str(row["id"])
    locale = row["locale"] or "en"

    async with semaphore:
        html = await fetch_html_local(pool, pid, locale)
        if not html:
            log.warning("enrich.local.no_html", posting_id=pid, locale=locale)
            await pool.execute(
                "UPDATE job_posting SET to_be_enriched = true WHERE id = $1::uuid",
                pid,
            )
            return (pid, None, None, "no_html")

        # Rate-limit: acquire slot and sleep for rate limiting
        async with rate_limiter["lock"]:
            if rate_limiter["attempts"] > 0:
                # Sleep to maintain rate limit
                await asyncio.sleep(60 / rate_limiter["rpm"])
            rate_limiter["attempts"] += 1

        user_msg = build_user_message(
            html,
            title=row["title"],
            locations=None,
            employment_type=row["employment_type"],
        )

        try:
            parsed_dict, usage = await provider.generate(
                system_prompt=system_prompt,
                user_content=user_msg,
                response_schema=enrichment_schema,
            )
            log.info("enrich.local.gemini_call", posting_id=pid)
            return (pid, parsed_dict, usage, "success")
        except Exception as exc:
            log.warning("enrich.local.gemini_error", posting_id=pid, error=str(exc))
            await pool.execute(
                "UPDATE job_posting SET to_be_enriched = true WHERE id = $1::uuid",
                pid,
            )
            return (pid, None, None, "api_error")


async def run_sync_enrich(
    pool: asyncpg.Pool,
    provider,
    *,
    batch_size: int = 20,
    rate_limit_rpm: int = 15,
    max_concurrent: int = 5,
) -> dict:
    """Claim pending postings, enrich via parallel Gemini calls, persist results.

    provider — SyncProvider instance (GeminiSyncProvider).
    batch_size — postings per claim iteration (default 20).
    rate_limit_rpm — max Gemini calls per minute (default 15).
    max_concurrent — max concurrent enrichment tasks (default 5).

    Returns {"enriched": N, "failed": M, "skipped": K}.
    """
    from src.config import settings
    from src.core.enrich.batch import _persist_results
    from src.core.enrich.job import SYSTEM_PROMPT, EnrichmentResult

    total_enriched = total_failed = total_skipped = 0
    semaphore = asyncio.Semaphore(max_concurrent)
    system_prompt = SYSTEM_PROMPT
    enrichment_schema = EnrichmentResult.model_json_schema()

    while True:
        rows = await pool.fetch(_CLAIM_PENDING_LOCAL, batch_size)
        if not rows:
            break

        # Shared rate limiter across all concurrent tasks
        rate_limiter = {
            "attempts": 0,
            "rpm": rate_limit_rpm,
            "lock": asyncio.Lock(),
        }

        # Run all enrichment tasks concurrently with gather
        tasks = [
            _process_enrichment_task(
                pool,
                provider,
                row,
                semaphore,
                rate_limiter,
                system_prompt,
                enrichment_schema,
            )
            for row in rows
        ]
        results_with_outcome = await asyncio.gather(*tasks, return_exceptions=False)

        # Process results: separate by outcome and prepare for persistence
        results = []  # For _persist_results
        posting_ids = []
        gemini_calls_made = 0

        for pid, parsed_dict, usage, outcome in results_with_outcome:
            posting_ids.append(pid)
            results.append((pid, parsed_dict, usage))

            if outcome == "success":
                total_enriched += 1
                gemini_calls_made += 1
            elif outcome == "no_html":
                total_skipped += 1
            elif outcome == "api_error":
                total_failed += 1

        # Break if no successful enrichments
        if gemini_calls_made == 0:
            break

        # Insert synthetic enrich_batch row before calling _persist_results
        batch_id = f"local_sync_{uuid4()}"
        await pool.execute(
            """
            INSERT INTO enrich_batch (id, provider, model, status, item_count, posting_ids)
            VALUES ($1, 'gemini', $2, 'submitted', $3, $4::uuid[])
            """,
            batch_id,
            settings.enrich_model or "gemini-2.0-flash",
            len(posting_ids),
            posting_ids,
        )

        await _persist_results(pool, results, batch_id)

        log.info(
            "enrich.local.batch_done",
            batch_id=batch_id,
            enriched=total_enriched,
            failed=total_failed,
            skipped=total_skipped,
        )

    return {"enriched": total_enriched, "failed": total_failed, "skipped": total_skipped}
