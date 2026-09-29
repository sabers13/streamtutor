import pytest
from app.analyzers.base import is_level_at_least, CEFR_RANKS
from app.analyzers.deterministic import DeterministicAnalyzer


def test_cefr_hierarchy():
    assert CEFR_RANKS["A1"] < CEFR_RANKS["A2"] < CEFR_RANKS["B1"] < CEFR_RANKS["B2"] < CEFR_RANKS["C1"] < CEFR_RANKS["C2"]


def test_is_level_at_least():
    # Threshold B1
    assert is_level_at_least("B1", "B1") is True
    assert is_level_at_least("B2", "B1") is True
    assert is_level_at_least("C1", "B1") is True
    assert is_level_at_least("A2", "B1") is False
    assert is_level_at_least("A1", "B1") is False

    # Threshold B2
    assert is_level_at_least("B1", "B2") is False
    assert is_level_at_least("B2", "B2") is True


@pytest.mark.asyncio
async def test_deterministic_analyzer_canonical_b1():
    analyzer = DeterministicAnalyzer()
    res = await analyzer.analyze(
        text="Du weißt doch überhaupt nicht, wovon du redest.",
        user_level="A2",
        threshold="B1",
    )
    assert res.estimated_level == "B1"
    assert res.show_help is True
    assert "wovon" in res.translation.lower() or "talking about" in res.translation.lower()
    assert "wovon" in res.note
    assert any(iw.word == "wovon" for iw in res.important_words)


@pytest.mark.asyncio
async def test_deterministic_analyzer_a1_sentence():
    analyzer = DeterministicAnalyzer()
    res = await analyzer.analyze(
        text="Das ist mein Ninja-Weg.",
        user_level="A2",
        threshold="B1",
    )
    assert res.estimated_level == "A1"
    # A1 should NOT show help when threshold is B1!
    assert res.show_help is False


@pytest.mark.asyncio
async def test_deterministic_analyzer_threshold_configurability():
    analyzer = DeterministicAnalyzer()
    # Sentence is A2
    res_b1_thresh = await analyzer.analyze(
        text="Ich gebe niemals auf, das ist mein Ninja-Weg.",
        user_level="A2",
        threshold="B1",
    )
    assert res_b1_thresh.estimated_level == "A2"
    assert res_b1_thresh.show_help is False

    # If threshold is lowered to A2+, it should show help:
    res_a2_thresh = await analyzer.analyze(
        text="Ich gebe niemals auf, das ist mein Ninja-Weg.",
        user_level="A2",
        threshold="A2",
    )
    assert res_a2_thresh.estimated_level == "A2"
    assert res_a2_thresh.show_help is True
