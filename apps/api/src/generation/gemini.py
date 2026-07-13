"""
Gemini client — implements LLMClient using google-genai SDK.
"""

import asyncio
import logging
from typing import Type, TypeVar

from google import genai
from google.genai import types as gtypes
from pydantic import BaseModel

from src.generation.llm_client import LLMClient, LLMError

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

_RETRYABLE = {429, 500, 502, 503, 504}


class GeminiClient(LLMClient):
    def __init__(self, api_key: str) -> None:
        self._client = genai.Client(api_key=api_key)

    async def generate(
        self,
        *,
        prompt: str,
        schema: Type[T],
        system: str,
        model: str,
        temperature: float = 0.85,
        max_retries: int = 3,
    ) -> T:
        last_exc: Exception | None = None

        for attempt in range(max_retries):
            try:
                response = await self._client.aio.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=gtypes.GenerateContentConfig(
                        system_instruction=system,
                        response_mime_type="application/json",
                        response_schema=schema,
                        temperature=temperature,
                    ),
                )

                if not response.text:
                    raise LLMError("Gemini returned an empty response")

                result = schema.model_validate_json(response.text)

                usage = getattr(response, "usage_metadata", None)
                if usage is not None:
                    from src.generation.events import log_event
                    log_event(
                        "llm_text",
                        model,
                        input_tokens=getattr(usage, "prompt_token_count", None),
                        output_tokens=getattr(usage, "candidates_token_count", None),
                    )

                return result

            except LLMError:
                raise
            except Exception as exc:
                last_exc = exc
                status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
                is_retryable = status in _RETRYABLE if status else True

                if not is_retryable or attempt == max_retries - 1:
                    raise LLMError(
                        f"Gemini call failed after {attempt + 1} attempt(s): {exc}"
                    ) from exc

                wait = 2 ** attempt
                logger.warning("Gemini attempt %d/%d failed (%s), retrying in %ds",
                               attempt + 1, max_retries, exc, wait)
                await asyncio.sleep(wait)

        raise LLMError(f"All {max_retries} Gemini attempts failed") from last_exc


# Keep the old name importable for any stray references
GeminiError = LLMError
