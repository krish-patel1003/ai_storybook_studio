"""
Abstract LLM client interface.

Every provider (Gemini, Ollama, …) implements this so the stage modules
and pipeline are completely provider-agnostic.
"""

from abc import ABC, abstractmethod
from typing import Type, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    """Raised when all retry attempts on any provider are exhausted."""


class LLMClient(ABC):
    @abstractmethod
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
        """Call the model and return a validated Pydantic instance."""
