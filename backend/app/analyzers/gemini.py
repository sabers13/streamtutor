import json
import logging
import re
from typing import Optional
from google import genai
from app.analyzers.base import SentenceAnalyzer, is_level_at_least
from app.analyzers.deterministic import DeterministicAnalyzer
from app.config import config
from app.models import AnalyzeSentenceResponse, ImportantWord

logger = logging.getLogger("german-stream-tutor.gemini")


class GeminiAnalyzer(SentenceAnalyzer):
    """
    Live AI analyzer using Google Gemini API (Interactions API / gemini-3.6-flash).
    Provides context-aware CEFR difficulty rating, natural English translation,
    and concise grammatical explanations for German anime dialogue.
    """

    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key or config.GEMINI_API_KEY
        self._fallback = DeterministicAnalyzer()
        try:
            self._client = genai.Client(api_key=self._api_key) if self._api_key else genai.Client()
        except Exception as e:
            logger.warning(f"Failed to initialize Gemini Client: {e}")
            self._client = None

    @property
    def name(self) -> str:
        return "gemini-3.8-flash"

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

        if not self._client:
            return await self._fallback.analyze(text, previous, next_text, user_level, threshold)

        context_lines = []
        if previous:
            context_lines.append(f"Previous subtitle line: \"{previous}\"")
        context_lines.append(f"Current subtitle line to analyze: \"{clean_text}\"")
        if next_text:
            context_lines.append(f"Next subtitle line: \"{next_text}\"")

        context_block = "\n".join(context_lines)

        prompt = f"""You are an expert German language tutor helping an English speaker learning German while watching Naruto (anime with German dubbing/subtitles).
User current German level is ~{user_level}.

Analyze the current subtitle line in conversational context:
{context_block}

Requirements:
1. Estimate CEFR difficulty level: strictly one of "A1", "A2", "B1", "B2", "C1", "C2".
2. Provide a natural, fluent English translation faithful to anime/ninja dialogue.
3. Provide ONE concise grammar or vocabulary tip (maximum 20 words). E.g. explain idioms, Konjunktiv II, separable verbs, subordinate word order, or modal particles.
4. List 1 to 3 key words, idioms, or grammar structures with their meanings in English.

Respond strictly with valid JSON conforming to:
{{
  "estimated_level": "B1",
  "translation": "Natural English translation here",
  "note": "One short, clear explanation of grammar or idiom",
  "important_words": [
    {{"word": "German word or idiom", "meaning": "English meaning"}}
  ]
}}"""

        try:
            import asyncio

            def _call_gemini():
                return self._client.interactions.create(
                    model="gemini-3.8-flash",
                    input=prompt,
                    generation_config={"thinking_level": "low"},
                )

            interaction = await asyncio.wait_for(asyncio.to_thread(_call_gemini), timeout=3.5)
            raw_output = interaction.output_text or ""
            match = re.search(r"\{.*\}", raw_output, re.DOTALL)
            if not match:
                logger.warning(f"Could not extract JSON from Gemini output: {raw_output}")
                return await self._fallback.analyze(text, previous, next_text, user_level, threshold)

            data = json.loads(match.group(0))
            level = str(data.get("estimated_level", "B1")).upper()
            translation = str(data.get("translation", "")).strip()
            note = data.get("note")
            if note:
                note = str(note).strip()

            raw_words = data.get("important_words", [])
            words: list[ImportantWord] = []
            if isinstance(raw_words, list):
                for w in raw_words:
                    if isinstance(w, dict) and "word" in w and "meaning" in w:
                        words.append(ImportantWord(word=str(w["word"]), meaning=str(w["meaning"])))

            show_help = is_level_at_least(level, threshold)

            return AnalyzeSentenceResponse(
                text=clean_text,
                estimated_level=level,
                show_help=show_help,
                translation=translation,
                note=note,
                important_words=words,
            )

        except Exception as e:
            logger.error(f"Gemini API request failed for '{clean_text}': {e}", exc_info=True)
            return await self._fallback.analyze(text, previous, next_text, user_level, threshold)
