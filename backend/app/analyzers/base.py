from abc import ABC, abstractmethod
from typing import Optional
from app.models import AnalyzeSentenceResponse

CEFR_RANKS = {
    "A1": 1,
    "A2": 2,
    "B1": 3,
    "B2": 4,
    "C1": 5,
    "C2": 6,
}


def is_level_at_least(level: str, threshold: str) -> bool:
    """
    Returns True if `level` meets or exceeds `threshold`.
    Defaults to False if level or threshold is invalid.
    """
    rank = CEFR_RANKS.get(level.upper(), 1)
    thresh_rank = CEFR_RANKS.get(threshold.upper(), 3)  # default B1 = 3
    return rank >= thresh_rank


class SentenceAnalyzer(ABC):
    """
    Abstract interface for sentence difficulty estimation, translation, and grammatical explanation.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Name of the analyzer provider"""
        pass

    @abstractmethod
    async def analyze(
        self,
        text: str,
        previous: Optional[str] = None,
        next_text: Optional[str] = None,
        user_level: str = "A2",
        threshold: str = "B1",
    ) -> AnalyzeSentenceResponse:
        """
        Analyzes a German subtitle sentence.
        """
        pass
