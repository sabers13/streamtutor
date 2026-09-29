import logging
from pathlib import Path
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from app.analyzers import get_analyzer, is_level_at_least
from app.cache import cache
from app.config import config
from app.flashcards import flashcards
from app.models import (
    AnalyzeEpisodeRequest,
    AnalyzeEpisodeResponse,
    AnalyzeSentenceRequest,
    AnalyzeSentenceResponse,
    ExplainSentenceRequest,
    ExplainSentenceResponse,
    LookupWordResponse,
    SaveFlashcardRequest,
    SaveFlashcardResponse,
)
from app.explainer import explainer
from app.normalizer import normalize_subtitle_text

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("german-stream-tutor")

app = FastAPI(
    title="German Stream Tutor API",
    description="FastAPI service analyzing German subtitles for CEFR difficulty and learner assistance.",
    version="0.1.0",
)

# Allow local extension and browser origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

analyzer = get_analyzer()
TEST_PAGE_PATH = Path(__file__).resolve().parent.parent.parent / "test-page" / "index.html"


@app.get("/")
@app.get("/test")
async def serve_test_page():
    """
    Serves the interactive local Naruto test sandbox page.
    """
    if TEST_PAGE_PATH.exists():
        return FileResponse(TEST_PAGE_PATH, media_type="text/html")
    return {
        "message": "German Stream Tutor API is active.",
        "health": "/health",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint reporting analyzer status and cache stats.
    """
    return {
        "status": "ok",
        "provider": analyzer.name,
        "cache_entries": cache.count(),
        "default_user_level": config.DEFAULT_USER_LEVEL,
        "default_threshold": config.DEFAULT_THRESHOLD,
    }


@app.post("/analyze-sentence", response_model=AnalyzeSentenceResponse)
async def analyze_sentence(request: AnalyzeSentenceRequest):
    """
    Analyzes a single German subtitle sentence.
    Returns CEFR difficulty estimate, translation, and grammatical explanation.
    Caches results in SQLite to ensure instant responses on repeat occurrences.
    """
    raw_text = request.text.strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="Sentence text cannot be empty.")

    normalized = normalize_subtitle_text(raw_text)
    user_level = request.user_level or config.DEFAULT_USER_LEVEL
    threshold = request.threshold or config.DEFAULT_THRESHOLD

    active_analyzer = analyzer
    if request.ai_enabled is False:
        from app.analyzers.deterministic import DeterministicAnalyzer
        active_analyzer = DeterministicAnalyzer()

    # Compute cache key
    cache_key = cache.compute_key(
        text=normalized,
        previous=request.previous,
        next_text=request.next,
        analyzer_version=active_analyzer.name,
        user_level=user_level,
        threshold=threshold,
    )

    # 1. Check persistent SQLite cache
    cached_result = cache.get(cache_key)
    if cached_result is not None:
        logger.debug("Cache hit for sentence: %s", normalized)
        return cached_result

    # 2. Invoke analyzer
    logger.info("Analyzing sentence (%s): %s", active_analyzer.name, normalized)
    result = await active_analyzer.analyze(
        text=normalized,
        previous=request.previous,
        next_text=request.next,
        user_level=user_level,
        threshold=threshold,
    )

    # 3. Store in cache
    cache.set(cache_key, result)

    return result


@app.post("/explain-sentence", response_model=ExplainSentenceResponse)
async def explain_sentence(request: ExplainSentenceRequest):
    """
    On-demand AI breakdown for a specific sentence when the user pauses and clicks 'Explain'.
    Returns a focused explanation strictly under 50-60 words.
    """
    raw_text = request.text.strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="Sentence text cannot be empty.")

    normalized = normalize_subtitle_text(raw_text)
    user_level = request.user_level or config.DEFAULT_USER_LEVEL

    explanation = await explainer.explain(
        text=normalized,
        previous=request.previous,
        next_text=request.next,
        user_level=user_level,
    )

    return ExplainSentenceResponse(text=normalized, explanation=explanation)


@app.post("/analyze-episode", response_model=AnalyzeEpisodeResponse)
async def analyze_episode(request: AnalyzeEpisodeRequest):
    """
    Batch analyzes an entire episode's subtitle cues.
    Pre-populates the SQLite cache for instant lookup during playback.
    """
    user_level = request.user_level or config.DEFAULT_USER_LEVEL
    threshold = request.threshold or config.DEFAULT_THRESHOLD
    results: List[AnalyzeSentenceResponse] = []
    b1_plus_count = 0

    cues = request.cues
    total = len(cues)

    for i, cue in enumerate(cues):
        text = normalize_subtitle_text(cue.text)
        if not text:
            continue

        prev_text = cues[i - 1].text if i > 0 else None
        next_text = cues[i + 1].text if i < total - 1 else None

        cache_key = cache.compute_key(
            text=text,
            previous=prev_text,
            next_text=next_text,
            analyzer_version=analyzer.name,
            user_level=user_level,
            threshold=threshold,
        )

        cached = cache.get(cache_key)
        if cached:
            results.append(cached)
            if cached.show_help:
                b1_plus_count += 1
            continue

        res = await analyzer.analyze(
            text=text,
            previous=prev_text,
            next_text=next_text,
            user_level=user_level,
            threshold=threshold,
        )
        cache.set(cache_key, res)
        results.append(res)
        if res.show_help:
            b1_plus_count += 1

    return AnalyzeEpisodeResponse(
        results=results,
        total=len(results),
        b1_plus_count=b1_plus_count,
    )


@app.get("/lookup-word", response_model=LookupWordResponse)
async def lookup_word(word: str):
    """
    Fast dictionary lookup for any single German word clicked or hovered by the user.
    """
    if not word or not word.strip():
        raise HTTPException(status_code=400, detail="Word cannot be empty.")
    return await flashcards.lookup_word(word)


@app.post("/save-flashcard", response_model=SaveFlashcardResponse)
async def save_flashcard(request: SaveFlashcardRequest):
    """
    Saves a word or sentence flashcard to persistent local disk (SQLite + CSV)
    and attempts background push to AnkiConnect.
    """
    return await flashcards.save_card(request)


@app.get("/flashcard-count")
async def get_flashcard_count():
    """Returns the total number of saved flashcards waiting to be exported."""
    return {"count": flashcards.get_count()}


@app.get("/export-flashcards")
async def export_flashcards(format: str = "csv"):
    """
    Exports all saved flashcards as CSV or JSON.
    """
    if format == "json":
        return flashcards.export_all()
    # Default CSV
    if flashcards.csv_path.exists():
        return FileResponse(
            flashcards.csv_path,
            media_type="text/csv",
            filename="streamtutor_flashcards.csv",
        )
    return {"message": "No flashcards saved yet.", "count": 0}


@app.delete("/flashcards")
async def clear_flashcards():
    """Clears saved flashcards from local file and database."""
    flashcards.clear()
    return {"success": True, "message": "Cleared all saved flashcards."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=config.HOST, port=config.PORT, reload=True)
