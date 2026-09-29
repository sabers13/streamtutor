import json
import logging
import os
import re
from pathlib import Path
from typing import Optional
import httpx
from app.analyzers.base import SentenceAnalyzer, is_level_at_least
from app.analyzers.deterministic import DeterministicAnalyzer
from app.config import config
from app.models import AnalyzeSentenceResponse, ImportantWord

logger = logging.getLogger("german-stream-tutor.deepseek")


class DeepSeekAnalyzer(SentenceAnalyzer):
    """
    Fast AI analyzer using DeepSeek (e.g. deepseek-v4.1-flash).
    Supports OpenCode Zen endpoint, TokenRouter, or direct DeepSeek API.
    Provides context-aware CEFR difficulty, natural English translation,
    and concise grammatical explanations for German anime dialogue.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self._fallback = DeterministicAnalyzer()
        self._model = model or getattr(config, "DEEPSEEK_MODEL", "deepseek-v4.1-flash")
        
        # Discover credentials and endpoint
        self._api_key = api_key or getattr(config, "DEEPSEEK_API_KEY", "")
        self._base_url = base_url or getattr(config, "DEEPSEEK_BASE_URL", "")

        if not self._api_key:
            # Check OpenCode auth credentials first
            opencode_auth = Path.home() / ".local" / "share" / "opencode" / "auth.json"
            if opencode_auth.exists():
                try:
                    with open(opencode_auth, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if "opencode" in data and isinstance(data["opencode"], dict):
                            self._api_key = data["opencode"].get("key", "")
                            if not self._base_url:
                                self._base_url = "https://opencode.ai/zen/v1"
                except Exception as e:
                    logger.debug(f"Could not load OpenCode auth: {e}")

        # Check TokenRouter as fallback
        if not self._api_key and getattr(config, "TOKENROUTER_API_KEY", ""):
            self._api_key = config.TOKENROUTER_API_KEY
            if not self._base_url:
                self._base_url = "https://api.tokenrouter.com/v1"

        if not self._base_url:
            self._base_url = "https://api.deepseek.com/v1"

        self._headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "User-Agent": "opencode/1.18.33/linux/x64",
        }

    @property
    def name(self) -> str:
        return f"deepseek:{self._model}"

    async def analyze(
        self,
        text: str,
        previous: Optional[str] = None,
        next_text: Optional[str] = None,
        user_level: str = "A2",
        threshold: str = "B1",
    ) -> AnalyzeSentenceResponse:
        clean_text = text.strip()
        if not clean_text:
            return AnalyzeSentenceResponse(
                text=text,
                estimated_level="A1",
                show_help=False,
                translation="",
                note=None,
                important_words=[],
            )

        if not self._api_key:
            logger.warning("No DeepSeek/OpenCode API key found, using deterministic analyzer")
            return await self._fallback.analyze(text, previous, next_text, user_level, threshold)

        context_lines = []
        if previous:
            context_lines.append(f'Previous subtitle line: "{previous}"')
        context_lines.append(f'Current subtitle line to analyze: "{clean_text}"')
        if next_text:
            context_lines.append(f'Next subtitle line: "{next_text}"')

        context_block = "\n".join(context_lines)

        prompt = f"""You are an expert German language tutor helping an English speaker learning German while watching Naruto (German dub/sub).
User current German level is ~{user_level}.

Analyze the current subtitle line in conversational context:
{context_block}

Requirements:
1. Estimate CEFR difficulty level: strictly one of "A1", "A2", "B1", "B2", "C1", "C2".
2. Provide a natural, fluent English translation faithful to anime/ninja dialogue.
3. Provide ONE concise grammar or vocabulary tip (maximum 20 words). E.g. explain idioms, Konjunktiv II, separable verbs, subordinate word order, or modal particles.
4. List 1 to 3 key words, idioms, or grammar structures with their meanings in English.

Respond strictly with valid JSON:
{{
  "estimated_level": "A2",
  "translation": "Natural English translation here",
  "note": "One short, clear explanation of grammar or idiom",
  "important_words": [
    {{"word": "German word or idiom", "meaning": "English meaning"}}
  ]
}}"""

        payload = {
            "model": self._model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a fast German language tutor. Output strictly raw JSON without thinking, reasoning, or markdown backticks.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.0,
            "max_tokens": 300,
        }

        endpoint = f"{self._base_url.rstrip('/')}/chat/completions"

        try:
            async with httpx.AsyncClient(timeout=2.5) as client:
                resp = await client.post(endpoint, json=payload, headers=self._headers)
                if resp.status_code != 200:
                    logger.warning(f"DeepSeek API error {resp.status_code}: {resp.text[:120]}")
                    return await self._fallback.analyze(text, previous, next_text, user_level, threshold)

                data = resp.json()
                raw_output = data["choices"][0]["message"].get("content", "").strip()

                # Clean markdown fences if present
                clean_json = raw_output
                if "```" in clean_json:
                    clean_json = re.sub(r"^```(?:json)?\s*", "", clean_json, flags=re.MULTILINE)
                    clean_json = re.sub(r"\s*```$", "", clean_json, flags=re.MULTILINE)

                match = re.search(r"\{.*\}", clean_json, re.DOTALL)
                if not match:
                    logger.warning(f"Failed to find JSON in DeepSeek output: {raw_output[:100]}")
                    return await self._fallback.analyze(text, previous, next_text, user_level, threshold)

                parsed = json.loads(match.group(0))
                level = str(parsed.get("estimated_level", "B1")).upper()
                if level not in ("A1", "A2", "B1", "B2", "C1", "C2"):
                    level = "B1"

                translation = str(parsed.get("translation", "")).strip()
                if not translation:
                    fb = await self._fallback.analyze(text, previous, next_text, user_level, threshold)
                    translation = fb.translation

                note = parsed.get("note")
                words_data = parsed.get("important_words", [])
                important_words = []
                for item in words_data:
                    if isinstance(item, dict) and "word" in item and "meaning" in item:
                        important_words.append(
                            ImportantWord(word=str(item["word"]), meaning=str(item["meaning"]))
                        )

                show_help = is_level_at_least(level, threshold)
                return AnalyzeSentenceResponse(
                    text=text,
                    estimated_level=level,
                    show_help=show_help,
                    translation=translation,
                    note=note,
                    important_words=important_words,
                )

        except Exception as e:
            logger.warning(f"DeepSeek call failed or timed out: {e}. Falling back to fast translator.")
            return await self._fallback.analyze(text, previous, next_text, user_level, threshold)
