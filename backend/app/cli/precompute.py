"""
CLI tool to batch pre-compute German subtitle analysis for entire episodes.
Loads subtitle files (.vtt, .srt, or plain .txt lines), analyzes them via DeepSeek,
Gemini, or local analyzer, and caches results directly into SQLite cache.db.

Usage:
    python backend/app/cli/precompute.py subtitles/episode_01.vtt
    python backend/app/cli/precompute.py subtitles/lines.txt --provider deepseek
"""

import argparse
import asyncio
import re
import sys
from pathlib import Path
from typing import List

# Ensure backend root is on sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.analyzers import get_analyzer
from app.cache import SentenceCache, cache
from app.config import config
from app.normalizer import normalize_subtitle_text


def parse_subtitles(file_path: Path) -> List[str]:
    content = file_path.read_text(encoding="utf-8", errors="ignore")
    lines: List[str] = []

    # If VTT/SRT format
    if file_path.suffix.lower() in (".vtt", ".srt"):
        # Strip timestamps e.g. 00:01:20.000 --> 00:01:23.000 or 00:01:20,000 --> 00:01:23,000
        clean = re.sub(r"\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}.*", "", content)
        # Strip WEBVTT header and sequence numbers
        clean = re.sub(r"WEBVTT.*?\n", "", clean, flags=re.IGNORECASE)
        clean = re.sub(r"^\d+\s*$", "", clean, flags=re.MULTILINE)

        raw_lines = clean.splitlines()
    else:
        raw_lines = content.splitlines()

    seen = set()
    for raw in raw_lines:
        normalized = normalize_subtitle_text(raw)
        if len(normalized) > 2 and normalized not in seen:
            seen.add(normalized)
            lines.append(normalized)

    return lines


async def main():
    parser = argparse.ArgumentParser(description="Pre-compute German subtitles into tutor cache.")
    parser.add_argument("file", type=Path, help="Path to .vtt, .srt, or .txt subtitle file")
    parser.add_argument("--user-level", default=config.DEFAULT_USER_LEVEL, help="Learner level (default: A2)")
    parser.add_argument("--threshold", default=config.DEFAULT_THRESHOLD, help="Help threshold (default: B1)")
    args = parser.parse_args()

    if not args.file.exists():
        print(f"Error: File not found: {args.file}")
        sys.exit(1)

    subtitles = parse_subtitles(args.file)
    print(f"Loaded {len(subtitles)} unique dialogue lines from {args.file.name}")

    analyzer = get_analyzer()
    print(f"Using analyzer: {analyzer.name}")

    cached_count = 0
    new_count = 0

    for i, line in enumerate(subtitles, start=1):
        prev = subtitles[i - 2] if i > 1 else None
        next_t = subtitles[i] if i < len(subtitles) else None

        cache_key = SentenceCache.compute_key(
            text=line,
            previous=prev,
            next_text=next_t,
            analyzer_version=config.ANALYZER_VERSION,
            user_level=args.user_level,
            threshold=args.threshold,
        )

        cached = cache.get(cache_key)
        if cached:
            cached_count += 1
            continue

        print(f"[{i}/{len(subtitles)}] Analyzing: {line[:50]}...")
        result = await analyzer.analyze(
            text=line,
            previous=prev,
            next_text=next_t,
            user_level=args.user_level,
            threshold=args.threshold,
        )
        cache.set(cache_key, result)
        new_count += 1

    print(f"\nDone! Pre-computed {new_count} new lines ({cached_count} already cached).")
    print(f"Total entries in cache.db: {cache.count()}")


if __name__ == "__main__":
    asyncio.run(main())
