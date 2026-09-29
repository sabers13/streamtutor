import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Optional
from app.config import config
from app.models import AnalyzeSentenceResponse, ImportantWord
from app.normalizer import canonical_key_text


class SentenceCache:
    """
    SQLite-backed cache for sentence difficulty analysis results.
    Prevents duplicate analysis requests for previously analyzed subtitles.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or config.CACHE_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sentence_cache (
                    cache_key TEXT PRIMARY KEY,
                    normalized_text TEXT NOT NULL,
                    estimated_level TEXT NOT NULL,
                    show_help INTEGER NOT NULL,
                    translation TEXT NOT NULL,
                    note TEXT NOT NULL,
                    important_words_json TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_text ON sentence_cache(normalized_text)")
            conn.commit()

    @staticmethod
    def compute_key(
        text: str,
        previous: Optional[str] = None,
        next_text: Optional[str] = None,
        analyzer_version: str = "v1.0",
        user_level: str = "A2",
        threshold: str = "B1",
    ) -> str:
        """
        Computes a deterministic SHA-256 hash key based on:
        - canonical subtitle text
        - preceding & subsequent context
        - analyzer version
        - user CEFR level
        - help threshold
        """
        canonical_curr = canonical_key_text(text)
        canonical_prev = canonical_key_text(previous or "")
        canonical_next = canonical_key_text(next_text or "")
        raw_key = f"{canonical_curr}||{canonical_prev}||{canonical_next}||{analyzer_version}||{user_level}||{threshold}"
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    def get(self, cache_key: str) -> Optional[AnalyzeSentenceResponse]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT normalized_text, estimated_level, show_help, translation, note, important_words_json
                FROM sentence_cache
                WHERE cache_key = ?
                """,
                (cache_key,),
            )
            row = cursor.fetchone()
            if not row:
                return None

            normalized_text, level, show_help, translation, note, words_json = row
            words_data = json.loads(words_json) if words_json else []
            important_words = [ImportantWord(**w) for w in words_data]

            return AnalyzeSentenceResponse(
                text=normalized_text,
                estimated_level=level,
                show_help=bool(show_help),
                translation=translation,
                note=note,
                important_words=important_words,
            )

    def set(self, cache_key: str, response: AnalyzeSentenceResponse):
        words_json = json.dumps([w.model_dump() for w in response.important_words])
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO sentence_cache (
                    cache_key, normalized_text, estimated_level, show_help, translation, note, important_words_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    cache_key,
                    response.text,
                    response.estimated_level,
                    1 if response.show_help else 0,
                    response.translation,
                    response.note,
                    words_json,
                ),
            )
            conn.commit()

    def count(self) -> int:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM sentence_cache")
            return cursor.fetchone()[0]


cache = SentenceCache()
