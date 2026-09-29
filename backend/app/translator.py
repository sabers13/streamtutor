import json
import logging
import urllib.parse
import urllib.request

logger = logging.getLogger("german-stream-tutor.translator")


def fast_translate_de_to_en(text: str) -> str:
    """
    Fast, reliable, zero-key German to English translation.
    Tries Google Translate GTX first (<100ms), then falls back to MyMemory API.
    Returns cleaned English translation string.
    """
    clean = text.strip()
    if not clean:
        return ""

    # 1. Try Google Translate GTX
    try:
        url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=de&tl=en&dt=t&q=" + urllib.parse.quote(clean)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=1.8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            translated = "".join([part[0] for part in data[0] if part and part[0]]).strip()
            if translated:
                return translated
    except Exception as e:
        logger.debug(f"GTX translation failed: {e}")

    # 2. Try MyMemory API fallback
    try:
        url = "https://api.mymemory.translated.net/get?q=" + urllib.parse.quote(clean) + "&langpair=de|en"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=1.8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            translated = data.get("responseData", {}).get("translatedText", "").strip()
            if translated:
                return translated
    except Exception as e:
        logger.debug(f"MyMemory translation failed: {e}")

    return clean
