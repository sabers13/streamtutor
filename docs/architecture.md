# German Stream Tutor: Architecture & Technical Design

## 1. Overview and Core Goal

**German Stream Tutor** is a local language-learning companion for watching German-dubbed content (e.g. *Naruto*) on Amazon Prime Video. Targeted at an A2 German learner transitioning to B1, it provides an unobtrusive, Lingopie-like learning layer:

1. **Watch naturally on Amazon Prime Video**: Audio and official German subtitles play without DRM tampering or custom video players.
2. **Real-time Subtitle Detection**: The active German subtitle sentence is captured either through Prime's native caption DOM rendering or via asbplayer's subtitle track cues.
3. **CEFR Difficulty Filtering**: Sentences are evaluated for estimated CEFR difficulty (A1–C2). If the sentence is within the user's comfort zone (A1/A2), the UI stays quiet.
4. **Contextual Assistance for B1+ Sentences**: Sentences estimated B1 or harder trigger an overlay showing:
   - Natural English translation.
   - Estimated CEFR difficulty badge (e.g., `[B1]`).
   - Compact grammar or vocabulary breakdown (e.g., clause connectors, separable verbs, preposition cases).
   - Key vocabulary definitions.
5. **Yomitan Compatibility**: German text is rendered as standard selectable HTML text nodes, enabling single-word hover/click lookups with the Yomitan extension.
6. **Local Caching**: Repeated sentences (common in anime catchphrases and dialogue) are instantly resolved from a local SQLite cache.

---

## 2. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Window                          │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                 Amazon Prime Video                  │   │
│   │                                                     │   │
│   │  ┌───────────────────────┐  ┌────────────────────┐  │   │
│   │  │ Amazon Native Caption │  │ asbplayer Track    │  │   │
│   │  │ DOM (.atvwebplayer... │  │ Sync / API         │  │   │
│   │  └──────────┬────────────┘  └─────────┬──────────┘  │   │
│   │             │                         │             │   │
│   │             ▼                         ▼             │   │
│   │   ┌─────────────────────────────────────────────┐   │   │
│   │   │         Tutor Content Script                │   │   │
│   │   │  - Sentence Normalizer                      │   │   │
│   │   │  - Multi-tier Synchronizer                  │   │   │
│   │   │  - In-Memory Dedup / Cache                  │   │   │
│   │   │  - Selectable Overlay (Yomitan compatible)  │   │   │
│   │   └──────────────────────┬──────────────────────┘   │   │
│   └──────────────────────────┼──────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────┘
                               │
                               │ HTTP POST /analyze-sentence
                               ▼ (localhost:8000)
┌─────────────────────────────────────────────────────────────┐
│               Python + FastAPI Backend                      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    API Router                         │  │
│  │    GET  /health                                       │  │
│  │    POST /analyze-sentence                             │  │
│  │    POST /analyze-episode                              │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│              ┌──────────────┴──────────────┐                │
│              ▼                             ▼                │
│  ┌─────────────────────────┐   ┌─────────────────────────┐  │
│  │   Analysis Cache        │   │    Sentence Analyzer    │  │
│  │   (SQLite: SHA256 key)  │   │        Interface        │  │
│  │   - Instant hit         │   ├─────────────────────────┤  │
│  │   - Store on miss       │   │ Deterministic / Mock    │  │
│  └─────────────────────────┘   │ (Rule-based CEFR + DB)  │  │
│                                ├─────────────────────────┤  │
│                                │ Optional LLM Provider   │  │
│                                │ (Gemini / OpenAI / etc) │  │
│                                └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Subtitle Synchronization Strategy

As discovered in our upstream findings, Amazon Prime Video features both direct caption DOM rendering and hidden internal metadata tracks. We employ a resilient **three-tier synchronization model**:

1. **Tier 1: Direct Caption DOM Observation (Primary for instant playback)**
   - Prime Video updates DOM elements whenever captions change:
     - `.atvwebplayersdk-captions-text`
     - `.atvwebplayersdk-captions-overlay`
     - `[class*='captions-text']`
   - A `MutationObserver` on the player container captures text changes with zero latency.
   - Text is cleaned: HTML entities unescaped, extra newlines removed, whitespace normalized.
   - No track download or parsing step required; works out of the box on any Prime episode.

2. **Tier 2: asbplayer Track Synchronization (When asbplayer is active)**
   - asbplayer extracts timed text cues (`SubtitleModel[]` with `start`, `end`, `text`).
   - If asbplayer has loaded the German subtitle track, we receive cues and correlate them with the currently displayed sentence.
   - Provides sentence boundary lookahead (previous and next subtitles) for richer context analysis.

3. **Tier 3: Video Timestamp Matching (Fallback)**
   - Correlates `video.currentTime` in milliseconds against known cue start and end intervals.

---

## 4. CEFR Analysis Engine & Interface

### Level Hierarchy
`A1 < A2 < B1 < B2 < C1 < C2`

### Analyzer Contract (`SentenceAnalyzer`)
```python
class SentenceAnalyzer(ABC):
    @abstractmethod
    async def analyze(
        self,
        text: str,
        previous: Optional[str] = None,
        next_text: Optional[str] = None,
        user_level: str = "A2",
    ) -> SentenceAnalysisResult:
        pass
```

### Deterministic / Mock Implementation
To ensure 100% offline functionality without API keys:
- Detects German grammatical markers indicative of B1+:
  - Subordinating conjunctions with verb-final structure (*dass, weil, obwohl, wenn, während, sodass, damit, wovon, worüber, weshalb*).
  - Relative pronouns and interrogative prepositions (*wovon, worauf, womit, woran*).
  - Passive voice (*wurde ... partizip II*, *worden*).
  - Konjunktiv II (*hätte, wäre, würde, könnte, müsste, sollte*).
  - Modal particles (*doch, überhaupt, bloß, mal, eigentlich, ja*).
- Uses a curated vocabulary index of common Naruto and conversational terms.
- Deterministically generates level estimates, translations, and pedagogical notes.

### Pluggable LLM Provider
When `TUTOR_ANALYZER_PROVIDER=llm` and an API key is supplied via environment variables, the system routes requests to an LLM provider for deep nuance and conversational context.

---

## 5. Caching Layer

Each sentence request computes a deterministic cache key:
```
cache_key = SHA256(
    normalize(text) + "||" +
    normalize(previous or "") + "||" +
    normalize(next or "") + "||" +
    analyzer_version + "||" +
    user_level
)
```
- Backed by an SQLite database (`backend/data/cache.db`).
- Returns in sub-millisecond time.
- Prepares the groundwork for `/analyze-episode` batch pre-caching.

---

## 6. Yomitan Integration & Styling

Yomitan requires unhindered cursor hit testing and DOM text selection:
- Overlay container uses `pointer-events: auto;`.
- Subtitle German text uses `user-select: text;`.
- Font styling uses high-legibility modern sans-serif typography (`Inter`, system-ui).
- Overlay sits at the top or lower-third above Amazon's native controls, preventing click interference with play/pause or scrub bars.
