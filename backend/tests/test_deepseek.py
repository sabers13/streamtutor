import pytest
from app.analyzers.deepseek import DeepSeekAnalyzer


@pytest.mark.asyncio
async def test_deepseek_analyzer_init_and_fallback():
    analyzer = DeepSeekAnalyzer(api_key="mock_invalid_key", base_url="https://invalid.test")
    # Should fall back cleanly without raising unhandled exceptions
    res = await analyzer.analyze("Ich habe ein Stirnband.", user_level="A2", threshold="B1")
    assert res.text == "Ich habe ein Stirnband."
    assert res.translation != ""
    assert res.estimated_level in ("A1", "A2", "B1", "B2", "C1", "C2")
