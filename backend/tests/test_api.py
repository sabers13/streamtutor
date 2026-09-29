import pytest
from httpx import ASGITransport, AsyncClient
import app.main as main_module
from app.analyzers import get_analyzer
from app.config import config
from app.main import app

# Ensure unit tests run against offline deterministic engine
config.ANALYZER_PROVIDER = "deterministic"
main_module.analyzer = get_analyzer()


@pytest.mark.asyncio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "provider" in data
    assert "cache_entries" in data


@pytest.mark.asyncio
async def test_analyze_sentence_success():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "text": "Du weißt doch überhaupt nicht, wovon du redest.",
            "user_level": "A2",
            "threshold": "B1",
        }
        response = await ac.post("/analyze-sentence", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["estimated_level"] == "B1"
    assert data["show_help"] is True
    assert "wovon" in data["note"]
    assert "translation" in data


@pytest.mark.asyncio
async def test_analyze_sentence_malformed_empty_text():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "text": "   ",
            "user_level": "A2",
        }
        response = await ac.post("/analyze-sentence", json=payload)
    # Empty string should fail with 400
    assert response.status_code == 400
    assert "detail" in response.json()


@pytest.mark.asyncio
async def test_analyze_sentence_missing_required_field():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "user_level": "A2",
        }
        response = await ac.post("/analyze-sentence", json=payload)
    # Missing required 'text' field should return 422 Unprocessable Entity
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_analyze_episode_batch():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "cues": [
                {"text": "Das ist mein Ninja-Weg!", "start": 1000, "end": 2000, "track": 0},
                {"text": "Du weißt doch überhaupt nicht, wovon du redest.", "start": 3000, "end": 5000, "track": 0},
            ],
            "user_level": "A2",
            "threshold": "B1",
        }
        response = await ac.post("/analyze-episode", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert data["b1_plus_count"] >= 1
    assert len(data["results"]) == 2


@pytest.mark.asyncio
async def test_explain_sentence_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "text": "Ich kann ihn nicht bestehen lassen.",
            "user_level": "A2",
        }
        response = await ac.post("/explain-sentence", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "explanation" in data
    assert len(data["explanation"]) > 10
    # Strict 60 words limit
    assert len(data["explanation"].split()) <= 60


@pytest.mark.asyncio
async def test_lookup_word_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Deterministic modal particle / pronominal adverb lookup
        resp = await ac.get("/lookup-word?word=wovon")
    assert resp.status_code == 200
    data = resp.json()
    assert data["word"] == "wovon"
    assert "about" in data["meaning"] or "what" in data["meaning"]


@pytest.mark.asyncio
async def test_save_and_export_flashcards():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Save flashcard
        payload = {
            "front": "bestehen lassen",
            "back": "to let pass",
            "card_type": "word",
            "example_sentence": "Ich kann ihn nicht bestehen lassen.",
            "sentence_translation": "I can't let him pass.",
            "cefr_level": "A2",
        }
        save_resp = await ac.post("/save-flashcard", json=payload)
        assert save_resp.status_code == 200
        assert save_resp.json()["success"] is True

        # Check count
        count_resp = await ac.get("/flashcard-count")
        assert count_resp.status_code == 200
        assert count_resp.json()["count"] >= 1

        # Check export
        export_resp = await ac.get("/export-flashcards?format=json")
        assert export_resp.status_code == 200
        cards = export_resp.json()
        assert len(cards) >= 1
        assert any(c["front"] == "bestehen lassen" for c in cards)
