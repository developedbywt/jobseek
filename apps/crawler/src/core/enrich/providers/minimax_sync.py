"""MiniMax synchronous provider for local-mode enrichment.

Uses OpenAI-compatible API at api.minimax.chat/v1.
"""

from __future__ import annotations

import json

from src.core.enrich.providers import LLMUsage


class MiniMaxSyncProvider:
    """Single-call MiniMax provider using the OpenAI-compatible chat API.

    Implements the SyncProvider Protocol:
        async def generate(system_prompt, user_content, response_schema) -> (dict, LLMUsage)
    """

    BASE_URL = "https://api.minimax.chat/v1"

    def __init__(self, model: str, api_key: str) -> None:
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=self.BASE_URL,
        )
        self._model = model

    async def generate(
        self,
        system_prompt: str,
        user_content: str,
        response_schema: dict,
    ) -> tuple[dict, LLMUsage]:
        """Make one structured JSON call. Returns (parsed_dict, LLMUsage)."""
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "enrichment_result",
                    "strict": True,
                    "schema": response_schema,
                },
            },
        )

        raw = response.choices[0].message.content
        parsed = json.loads(raw)

        u = response.usage
        usage = LLMUsage(
            input_tokens=u.prompt_tokens if u else 0,
            output_tokens=u.completion_tokens if u else 0,
            model=self._model,
            provider="minimax",
        )
        return parsed, usage
