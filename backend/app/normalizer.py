import html
import re


TAG_REGEX = re.compile(r"<[^>]+>")
WHITESPACE_REGEX = re.compile(r"\s+")
SPEAKER_PREFIX_REGEX = re.compile(r"^[A-ZÄÖÜa-zäöüß0-9\s_-]+:\s*")
LEADING_DASH_REGEX = re.compile(r"^[-–—]\s*")


def normalize_subtitle_text(text: str) -> str:
    """
    Cleans raw subtitle strings from Amazon Prime Video / asbplayer:
    1. Unescapes HTML entities (&quot;, &#39;, &nbsp;, etc.)
    2. Strips HTML/XML formatting tags (<font>, <i>, <br>, etc.)
    3. Normalizes speaker dashes (- Hallo -> Hallo)
    4. Collapses multi-line / irregular whitespaces into a clean single string
    """
    if not text:
        return ""

    # Decode HTML entities
    unescaped = html.unescape(text)

    # Strip HTML tags
    no_tags = TAG_REGEX.sub(" ", unescaped)

    # Replace newlines with spaces
    single_line = no_tags.replace("\r", " ").replace("\n", " ")

    # Strip leading dialogue dashes if present
    cleaned = LEADING_DASH_REGEX.sub("", single_line.strip())

    # Clean up spaces before punctuation
    cleaned = re.sub(r"\s+([,.:;!?])", r"\1", cleaned)

    # Collapse excessive spaces
    collapsed = WHITESPACE_REGEX.sub(" ", cleaned).strip()

    return collapsed


def canonical_key_text(text: str) -> str:
    """
    Canonical representation of text for hashing and cache key generation.
    Lowercases and trims punctuation boundaries.
    """
    norm = normalize_subtitle_text(text).lower()
    # Strip common leading/trailing quotes and punctuation
    stripped = norm.strip("\"'„“«»…,.!?:; ")
    return stripped
