"""
Ollama client — implements LLMClient using Ollama's local REST API.

Ollama must be running on the host (default: http://localhost:11434).
Inside Docker, set OLLAMA_BASE_URL=http://host.docker.internal:11434.

Structured output uses Ollama's `format` field (supported since 0.3.x).
The full Pydantic JSON schema is passed so the model is constrained to
produce valid JSON matching the schema shape.
"""

import asyncio
import json
import logging
from typing import Type, TypeVar

import httpx
from pydantic import BaseModel

from src.generation.llm_client import LLMClient, LLMError

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)


class OllamaClient(LLMClient):
    def __init__(self, base_url: str = "http://localhost:11434") -> None:
        self._base_url = base_url.rstrip("/")

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
        json_schema = schema.model_json_schema()
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "stream": False,
            "format": json_schema,
            "options": {
                "temperature": temperature,
                "num_predict": 4096,
            },
        }

        last_exc: Exception | None = None
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=180.0) as client:
                    response = await client.post(
                        f"{self._base_url}/api/chat",
                        json=payload,
                    )
                    response.raise_for_status()

                data = response.json()
                content = data["message"]["content"]

                # Some models wrap the output in markdown fences — strip them
                content = _strip_fences(content)

                return schema.model_validate_json(content)

            except LLMError:
                raise
            except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
                raise LLMError(
                    f"Cannot reach Ollama at {self._base_url}. "
                    "Make sure Ollama is running and OLLAMA_BASE_URL is correct."
                ) from exc
            except Exception as exc:
                last_exc = exc
                is_retryable = not isinstance(exc, (httpx.HTTPStatusError,)) or (
                    isinstance(exc, httpx.HTTPStatusError)
                    and exc.response.status_code >= 500
                )

                if not is_retryable or attempt == max_retries - 1:
                    raise LLMError(
                        f"Ollama call failed after {attempt + 1} attempt(s): {exc}"
                    ) from exc

                wait = 2 ** attempt
                logger.warning("Ollama attempt %d/%d failed (%s), retrying in %ds",
                               attempt + 1, max_retries, exc, wait)
                await asyncio.sleep(wait)

        raise LLMError(f"All {max_retries} Ollama attempts failed") from last_exc


async def list_ollama_models(base_url: str) -> list[dict]:
    """Return available Ollama models, or [] if Ollama is unreachable."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{base_url.rstrip('/')}/api/tags")
            r.raise_for_status()
            return r.json().get("models", [])
    except Exception:
        return []


def _strip_fences(text: str) -> str:
    """Remove markdown ```json … ``` wrappers that some models add."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        # Drop opening fence line and closing fence line
        inner = lines[1:] if lines[0].startswith("```") else lines
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        text = "\n".join(inner).strip()
    return text
