import csv
import json
import logging
import sqlite3
from pathlib import Path
from typing import Dict, List, Optional
import httpx
from app.config import config
from app.models import LookupWordResponse, SaveFlashcardRequest, SaveFlashcardResponse

logger = logging.getLogger("german-stream-tutor.flashcards")


class FlashcardManager:
    """
    Manages persistent flashcard storage on local disk (SQLite + CSV)
    and optional 1-click push to AnkiConnect.
    """

    def __init__(self, db_path: Optional[Path] = None, csv_path: Optional[Path] = None):
        self.db_path = db_path or config.CACHE_DB_PATH
        self.csv_path = csv_path or (config.DATA_DIR / "saved_flashcards.csv")
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS saved_flashcards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    front TEXT NOT NULL,
                    back TEXT NOT NULL,
                    card_type TEXT DEFAULT 'word',
                    example_sentence TEXT,
                    sentence_translation TEXT,
                    grammar_note TEXT,
                    cefr_level TEXT,
                    source TEXT DEFAULT 'StreamTutor / Video',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.commit()

    def _ensure_csv_header(self):
        if not self.csv_path.exists() or self.csv_path.stat().st_size == 0:
            with open(self.csv_path, "w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(
                    [
                        "German",
                        "English",
                        "Type",
                        "Example_Sentence",
                        "Sentence_Translation",
                        "Grammar_Note",
                        "CEFR_Level",
                        "Source",
                        "Created_At",
                    ]
                )

    async def save_card(self, req: SaveFlashcardRequest) -> SaveFlashcardResponse:
        front = req.front.strip()
        back = req.back.strip()

        # 1. Save to SQLite
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO saved_flashcards
                (front, back, card_type, example_sentence, sentence_translation, grammar_note, cefr_level, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    front,
                    back,
                    req.card_type,
                    req.example_sentence or "",
                    req.sentence_translation or "",
                    req.grammar_note or "",
                    req.cefr_level or "",
                    req.source or "StreamTutor / Video",
                ),
            )
            conn.commit()
            cursor.execute("SELECT COUNT(*) FROM saved_flashcards")
            total = cursor.fetchone()[0]

        # 2. Append to persistent CSV file on disk
        try:
            self._ensure_csv_header()
            with open(self.csv_path, "a", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(
                    [
                        front,
                        back,
                        req.card_type,
                        req.example_sentence or "",
                        req.sentence_translation or "",
                        req.grammar_note or "",
                        req.cefr_level or "",
                        req.source or "StreamTutor / Video",
                        "",
                    ]
                )
        except Exception as e:
            logger.warning(f"Failed to append to flashcards CSV: {e}")

        # 3. Optional: Attempt non-blocking AnkiConnect push if Anki desktop is open
        await self._push_to_anki(req)

        return SaveFlashcardResponse(
            success=True,
            total_saved=total,
            message=f"Saved '{front}' to flashcards file and database.",
        )

    async def _push_to_anki(self, req: SaveFlashcardRequest):
        """Attempts to push to local AnkiConnect (http://127.0.0.1:8765) if active."""
        try:
            deck_name = "German::StreamTutor"
            # Prepare Back field
            back_html = f"<strong>{req.back}</strong>"
            if req.example_sentence:
                back_html += f"<br><br><em>\"{req.example_sentence}\"</em>"
                if req.sentence_translation:
                    back_html += f"<br><span style='color:#60a5fa;'>{req.sentence_translation}</span>"
            if req.grammar_note:
                back_html += f"<br><br><small style='color:#f59e0b;'>💡 {req.grammar_note}</small>"

            payload = {
                "action": "addNote",
                "version": 6,
                "params": {
                    "note": {
                        "deckName": deck_name,
                        "modelName": "Basic",
                        "fields": {
                            "Front": req.front,
                            "Back": back_html,
                        },
                        "tags": ["German", "StreamTutor", req.cefr_level or "B1"],
                        "options": {"allowDuplicate": False},
                    }
                },
            }
            async with httpx.AsyncClient(timeout=1.0) as client:
                await client.post("http://127.0.0.1:8765", json=payload)
        except Exception:
            # Anki is not open or AnkiConnect not installed - silently ignore, cards are safely stored in file & SQLite!
            pass

    def get_count(self) -> int:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM saved_flashcards")
            return cursor.fetchone()[0]

    def export_all(self) -> List[Dict]:
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT front, back, card_type, example_sentence, sentence_translation,
                       grammar_note, cefr_level, source, created_at
                FROM saved_flashcards ORDER BY id DESC
                """
            )
            return [dict(row) for row in cursor.fetchall()]

    def clear(self):
        with self._get_connection() as conn:
            conn.execute("DELETE FROM saved_flashcards")
            conn.commit()
        if self.csv_path.exists():
            try:
                self.csv_path.unlink()
            except Exception:
                pass

    async def lookup_word(self, word: str) -> LookupWordResponse:
        """
        Fast dictionary lookup for any single German word clicked by the user.
        Uses offline deterministic vocabulary table first, falls back to Google GTX.
        """
        clean = word.strip().strip(".,!?:;\"'()[]{}«»")
        lower = clean.lower()

        # 1. Offline dictionary lookup
        from app.analyzers.deterministic import DeterministicAnalyzer

        det = DeterministicAnalyzer()

        # Check modal verbs
        if lower in det.MODAL_VERBS:
            info = det.MODAL_VERBS[lower]
            return LookupWordResponse(word=clean, meaning=info[0], grammar=f"Modal verb ({info[1]})")

        # Check subjunctions
        if lower in det.B1_SUBJUNCTIONS:
            return LookupWordResponse(word=clean, meaning=det.B1_SUBJUNCTIONS[lower], grammar="Subordinating conjunction")

        # Check pronominal adverbs
        if lower in det.B1_PRONOMINAL_ADVERBS:
            return LookupWordResponse(word=clean, meaning=det.B1_PRONOMINAL_ADVERBS[lower], grammar="Pronominal adverb")

        # Check particles
        if lower in det.B1_MODAL_PARTICLES:
            return LookupWordResponse(word=clean, meaning=det.B1_MODAL_PARTICLES[lower], grammar="Modal particle")

        # Check pronouns
        if hasattr(det, "PRONOUNS") and lower in det.PRONOUNS:
            info = det.PRONOUNS[lower]
            return LookupWordResponse(word=clean, meaning=info[0], grammar=f"Personal pronoun ({info[1]})")

        # Check vocabulary glossary
        if hasattr(det, "VOCABULARY_GLOSSARY") and lower in det.VOCABULARY_GLOSSARY:
            meaning = det.VOCABULARY_GLOSSARY[lower]
            return LookupWordResponse(word=clean, meaning=meaning)

        # 2. Fast translation fallback via fast_translate_de_to_en (GTX + MyMemory)
        try:
            from app.translator import fast_translate_de_to_en
            tr = fast_translate_de_to_en(clean)
            if tr and tr.lower() != lower:
                return LookupWordResponse(word=clean, meaning=tr)
        except Exception as e:
            logger.debug(f"Translator fallback error: {e}")

        return LookupWordResponse(word=clean, meaning=f"German: {clean}")


flashcards = FlashcardManager()
