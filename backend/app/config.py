import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)


class Config:
    HOST: str = os.getenv("TUTOR_BACKEND_HOST", "127.0.0.1")
    PORT: int = int(os.getenv("TUTOR_BACKEND_PORT", "8000"))

    # Provider: 'auto', 'gemini', 'deterministic'
    ANALYZER_PROVIDER: str = os.getenv("TUTOR_ANALYZER_PROVIDER", "auto").lower()

    # User profile settings
    DEFAULT_USER_LEVEL: str = os.getenv("TUTOR_USER_LEVEL", "A2")
    DEFAULT_THRESHOLD: str = os.getenv("TUTOR_HELP_THRESHOLD", "B1")

    # SQLite Database location
    DATA_DIR: Path = Path(os.getenv("TUTOR_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
    CACHE_DB_PATH: Path = DATA_DIR / "cache.db"

    # OpenCode Go API configuration
    OPENCODE_API_KEY: str = os.getenv("OPENCODE_API_KEY", "")
    OPENCODE_BASE_URL: str = os.getenv("OPENCODE_BASE_URL", "https://opencode.ai/zen/go/v1")
    OPENCODE_MODEL: str = os.getenv("OPENCODE_MODEL", "deepseek-v4-flash")
    OPENCODE_REASONING_EFFORT: str = os.getenv("OPENCODE_REASONING_EFFORT", "low")

    # Optional LLM API keys
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    TOKENROUTER_API_KEY: str = os.getenv("TOKENROUTER_API_KEY", "")
    DEEPSEEK_BASE_URL: str = os.getenv("TUTOR_DEEPSEEK_BASE_URL", "")
    DEEPSEEK_MODEL: str = os.getenv("TUTOR_DEEPSEEK_MODEL", "deepseek-v4-flash")

    # Analyzer version for cache invalidation
    ANALYZER_VERSION: str = "v1.2"


config = Config()
config.DATA_DIR.mkdir(parents=True, exist_ok=True)
