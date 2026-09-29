import tempfile
from pathlib import Path
import pytest
from app.cache import SentenceCache
from app.models import AnalyzeSentenceResponse, ImportantWord


@pytest.fixture
def temp_cache():
    with tempfile.TemporaryDirectory() as tmp_dir:
        db_path = Path(tmp_dir) / "test_cache.db"
        yield SentenceCache(db_path)


def test_cache_miss_and_hit(temp_cache: SentenceCache):
    key = temp_cache.compute_key("Du weißt doch überhaupt nicht, wovon du redest.")
    assert temp_cache.get(key) is None

    response = AnalyzeSentenceResponse(
        text="Du weißt doch überhaupt nicht, wovon du redest.",
        estimated_level="B1",
        show_help=True,
        translation="You have absolutely no idea what you're talking about.",
        note="wovon = wo(r) + von; reden von + dative",
        important_words=[ImportantWord(word="wovon", meaning="what ... about")],
    )

    temp_cache.set(key, response)
    cached = temp_cache.get(key)
    assert cached is not None
    assert cached.text == response.text
    assert cached.estimated_level == "B1"
    assert cached.show_help is True
    assert cached.translation == response.translation
    assert len(cached.important_words) == 1
    assert cached.important_words[0].word == "wovon"


def test_cache_key_invariance(temp_cache: SentenceCache):
    # Minor whitespace or quote differences should map to the same key
    k1 = temp_cache.compute_key("Du weißt doch überhaupt nicht, wovon du redest.")
    k2 = temp_cache.compute_key("  „Du weißt doch überhaupt nicht, wovon du redest!“  ")
    assert k1 == k2
