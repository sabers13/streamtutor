from app.analyzers.base import SentenceAnalyzer, is_level_at_least
from app.analyzers.deterministic import DeterministicAnalyzer
from app.config import config


def get_analyzer() -> SentenceAnalyzer:
    """
    Factory function returning the configured analyzer implementation.
    Priority order:
    1. If ANALYZER_PROVIDER == 'deterministic': DeterministicAnalyzer
    2. If ANALYZER_PROVIDER in ('deepseek', 'deepseek-flash') or (auto with opencode/deepseek key): DeepSeekAnalyzer
    3. If ANALYZER_PROVIDER in ('gemini') or (auto with GEMINI_API_KEY): GeminiAnalyzer
    4. Fallback: DeterministicAnalyzer
    """
    provider = config.ANALYZER_PROVIDER.lower()

    if provider == "deterministic":
        return DeterministicAnalyzer()

    if provider in ("deepseek", "deepseek-flash", "flash"):
        try:
            from app.analyzers.deepseek import DeepSeekAnalyzer
            return DeepSeekAnalyzer()
        except Exception:
            return DeterministicAnalyzer()

    # If provider is 'auto' or 'deepseek', prefer DeepSeek 4.1 Flash if opencode/tokenrouter/deepseek key available
    if provider in ("auto", "llm"):
        try:
            from app.analyzers.deepseek import DeepSeekAnalyzer
            ds = DeepSeekAnalyzer()
            if ds._api_key:
                return ds
        except Exception:
            pass

    if config.GEMINI_API_KEY or provider == "gemini":
        try:
            from app.analyzers.gemini import GeminiAnalyzer
            return GeminiAnalyzer()
        except Exception:
            return DeterministicAnalyzer()

    return DeterministicAnalyzer()


__all__ = ["SentenceAnalyzer", "DeterministicAnalyzer", "get_analyzer", "is_level_at_least"]
