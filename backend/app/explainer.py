import asyncio
import json
import logging
import os
import re
import sqlite3
from pathlib import Path
from typing import Optional
import uuid
import httpx
from app.config import config
from app.normalizer import canonical_key_text

logger = logging.getLogger("german-stream-tutor.explainer")


class SentenceExplainer:
    """
    On-demand AI explainer providing deep grammatical and contextual breakdown
    for specific German sentences when the user pauses and clicks 'Explain'.
    Enforces a strict 50-60 word limit so it never clutters the screen.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or config.CACHE_DB_PATH
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sentence_explanations (
                    cache_key TEXT PRIMARY KEY,
                    normalized_text TEXT NOT NULL,
                    explanation TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.commit()

    def _get_cached(self, key: str) -> Optional[str]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT explanation FROM sentence_explanations WHERE cache_key = ?", (key,))
            row = cursor.fetchone()
            return row[0] if row else None

    def _set_cached(self, key: str, text: str, explanation: str):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO sentence_explanations (cache_key, normalized_text, explanation) VALUES (?, ?, ?)",
                (key, text, explanation),
            )
            conn.commit()

    def _trim_to_limit(self, text: str, max_words: int = 60) -> str:
        words = text.split()
        if len(words) <= max_words:
            return text
        trimmed = " ".join(words[:max_words])
        # Ensure it ends with punctuation
        if not trimmed.endswith((".", "!", "?")):
            trimmed += "..."
        return trimmed

    async def explain(
        self,
        text: str,
        previous: Optional[str] = None,
        next_text: Optional[str] = None,
        user_level: str = "A2",
    ) -> str:
        clean_text = text.strip()
        if not clean_text:
            return "No text provided to explain."

        canonical = canonical_key_text(clean_text)
        cache_key = f"{canonical}__{user_level.upper()}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        prompt = f"""Break down the grammar and nuance of this German anime line for an English speaker (~{user_level} learner):
"{clean_text}"
{f'Context: "{previous}"' if previous else ''}

Explain:
1. Tricky grammar structures (cases, verb conjugation, prefixes, word order, idioms).
2. Nuances, word connotations, or character tone.

STRICT CONSTRAINTS:
- Do NOT translate the sentence (the user already has the full English translation).
- Keep your explanation strictly between 50 and 60 words!
- No greetings, no filler intro (do NOT say "Here is..."). Start directly with the grammatical breakdown."""

        # Call OpenCode Go API directly from .env
        api_key = config.OPENCODE_API_KEY
        base_url = config.OPENCODE_BASE_URL or "https://opencode.ai/zen/go/v1"
        model = config.OPENCODE_MODEL or "deepseek-v4-flash"
        reasoning_effort = config.OPENCODE_REASONING_EFFORT or "minimal"

        if api_key:
            try:
                payload = {
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are an expert German language tutor. Explain grammar structures, cases, and nuances in English in strictly 50 to 60 words. Do NOT translate the sentence. No introductory filler.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": 500,
                    "temperature": 0.2,
                    "reasoning_effort": reasoning_effort,
                }
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "x-opencode-session": f"ses_{uuid.uuid4().hex[:16]}",
                    "User-Agent": "opencode/1.18.33/linux/x64",
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        f"{base_url.rstrip('/')}/chat/completions",
                        json=payload,
                        headers=headers,
                    )
                    if resp.status_code == 200:
                        choice = resp.json().get("choices", [{}])[0]
                        raw = choice.get("message", {}).get("content", "").strip()
                        if raw:
                            clean_explanation = self._trim_to_limit(raw, max_words=60)
                            self._set_cached(cache_key, clean_text, clean_explanation)
                            return clean_explanation
                    else:
                        logger.warning(f"OpenCode API returned HTTP {resp.status_code}: {resp.text}")
            except Exception as e:
                logger.warning(f"OpenCode API call failed: {e}")

        # Fallback: Rich deterministic grammatical synthesis
        from app.analyzers.deterministic import DeterministicAnalyzer

        det = DeterministicAnalyzer()
        analysis = await det.analyze(clean_text, user_level=user_level)
        words_desc = ", ".join([f"{w.word} ({w.meaning})" for w in analysis.important_words[:3]])
        fallback_text = analysis.note
        if words_desc:
            fallback_text += f" Key vocabulary: {words_desc}."
        fallback_text = self._trim_to_limit(fallback_text, max_words=60)
        self._set_cached(cache_key, clean_text, fallback_text)
        return fallback_text


explainer = SentenceExplainer()
