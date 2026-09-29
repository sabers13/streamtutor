# Upstream Repositories Investigation & Findings

## 1. Exact Cloned Upstream Git SHAs

| Repository | Upstream URL | Cloned Commit SHA |
| :--- | :--- | :--- |
| **asbplayer** | `https://github.com/asbplayer/asbplayer` | `c01e584aa383da5e9894b96b2636b329b295c379` |
| **Yomitan** | `https://github.com/yomidevs/yomitan` | `67db60ddc2cbd7b5172d777c117e3201d7ddff0f` |
| **Dual Subtitles** | `https://github.com/MarkovYu/dualsubtitles` | `b4f24f3ebcb4dc680830ead70065b68d2c83f369` |

---

## 2. asbplayer: Architecture, APIs & Prime Integration

### Relevant Integration Files
- `extension/src/entrypoints/amazon-prime-page.ts`: Main-world unlisted script injected into Prime Video pages. Hooks `window.XMLHttpRequest` (`open`, `send`) and `window.fetch` to intercept `GetVodPlaybackResources` (titleId, subtitle URLs) and `playerChromeResources` (catalog metadata: series title, season, episode, title). Listens to `asbplayer-get-synced-data` CustomEvent on `document` and responds with `asbplayer-synced-data` containing `{ basename, subtitles: [{ id, label, language, url, extension }] }`.
- `extension/src/controllers/video-data-sync-controller.ts`: Controls track discovery, track matching, and user selection. Calls `_subtitlesForUrl(...)` to fetch TTML2/DFXP/SRT files and loads them into `Binding` via `_context.loadSubtitles(...)`.
- `extension/src/services/binding.ts`: Wraps each `<video>` element on the page. Holds `subtitleController` and `playbackEngine`.
- `extension/src/controllers/subtitle-controller.ts`: Holds loaded subtitles, offsets, and computes `currentSubtitle()` based on playback time.
- `extension/src/services/web-socket-client-binding.ts`: Manages WebSocket client connections to external servers. Implements external commands: `get-bound-media`, `get-subtitles`, `seek-timestamp`, `mine-subtitle`, `load-subtitles`.
- `docs/docs/reference/external-api.md`: Official documentation of asbplayer's external API.

### Relevant asbplayer External APIs
1. **WebSocket / HTTP External API (v1.20.0+)**:
   - Asbplayer extension contains a built-in WebSocket client that connects to a local server (default `ws://127.0.0.1:8766`).
   - `get-bound-media`: Returns list of bound streaming and local media, with IDs, titles, tab status, and loaded subtitle track filenames.
   - `get-subtitles`: Accepts `mediaId` and `trackNumbers`; returns subtitle cues array:
     ```json
     {
       "subtitles": [
         { "text": "...", "start": 1000, "end": 2500, "track": 0 }
       ]
     }
     ```
   - `seek-timestamp`: Seeks video to a given second offset.
2. **Browser Extension Messaging (Internal `asbplayerv2` protocol)**:
   - Handlers in `extension/src/handlers/asbplayerv2/`:
     - `request-subtitles`: Forwarded to video tab to fetch all subtitles currently loaded in `subtitleController`.
     - `request-current-subtitle`: Queries `subtitleController.currentSubtitle()` and returns `{ currentSubtitle, currentSubtitleIndex }`.
3. **DOM CustomEvents**:
   - `document.dispatchEvent(new CustomEvent('asbplayer-get-synced-data'))`: Page unlisted script responds via `'asbplayer-synced-data'` containing subtitle track URLs directly from Prime's `GetVodPlaybackResources`.

### Subtitle Representation & Format
- Subtitles are represented internally as:
  ```typescript
  interface SubtitleModel {
    text: string;
    start: number; // milliseconds
    end: number;   // milliseconds
    track: number;
    index?: number;
  }
  ```
- Amazon Prime provides subtitles primarily in **TTML2 / DFXP** (XML-based) or **WebVTT** formats.
- `SubtitleReader.ts` in asbplayer handles parsing TTML2 (`_parseTtmlTimestamp`, time in seconds/ms or tickRate) and removes XML/HTML tags.

### Current Playback & Cue Data Availability
- `request-current-subtitle` provides the active cue computed by asbplayer.
- However, asbplayer only knows cues once a subtitle track has been synced (either automatically or manually via asbplayer's popup/dialog).

---

## 3. Yomitan: Constraints & Compatibility

### Scanning & Selection Constraints
- Yomitan works via content scripts monitoring mouse pointer movement (e.g. mouse hover or Shift+hover) and clicking.
- Yomitan locates words using DOM range inspection (`document.caretRangeFromPoint` or `document.caretPositionFromPoint`).
- **Critical Requirement for Our Overlay**:
  1. The overlay container or text element **must NOT** have `pointer-events: none` on the text.
  2. The text **must NOT** have `user-select: none`. It must have `user-select: text` (or browser default).
  3. The German subtitle text should be clean text nodes in the DOM (e.g., standard `<span>` or `<p>` elements), rather than canvas or SVG text.
  4. The overlay should be placed in the main DOM tree (or open ShadowRoot) where Yomitan's content script can freely inspect DOM text.

---

## 4. Dual Subtitles: Implementation Reference & Amazon Prime Techniques

### Relevant Techniques & Discoveries
- `extension/inject.js`: Injected into main world on Prime Video (`primevideo.com` and `amazon.*`).
  - Finds player container via `div[id^='dv-web-player']` and reads React component tree:
    `el?._reactRootContainer?._internalRoot?.current?.child?.memoizedProps?.context`
    which contains direct player state and track metadata.
  - Also captures playback time (`postPrimeTime`) and metadata (`postPrimeMeta`).
- `extension/content.js`:
  - **DOM Caption Observation (Mirroring)**: Prime Video renders captions into DOM classes:
    - `.atvwebplayersdk-captions-text`
    - `.atvwebplayersdk-captions-overlay`
    - `[class*='captions-text']`
  - Uses `MutationObserver` on the player container or polls `mirrorVisibleCaptions()`.
  - Normalization: cleans extra whitespace, newlines, and entity decoding.
  - This provides a zero-setup, foolproof synchronization mechanism: whenever Amazon displays a German caption on screen, our extension immediately detects the exact rendered sentence without needing prior track download or parsing!

---

## 5. Discrepancies & Corrections to Prompt Assumptions

1. **asbplayer Subtitle Loading Lifecycle**:
   - *Prompt assumption*: asbplayer automatically detects Amazon subtitles and has them available immediately on video load.
   - *Reality*: asbplayer intercepts `GetVodPlaybackResources` to find the subtitle URLs, but the user must click sync or have auto-sync configured for asbplayer to download, parse, and bind the cues to the video.
   - *Architecture adjustment*: Our extension will support a robust multi-tier synchronization strategy:
     - **Tier 1 (Caption DOM Observation)**: Observe `.atvwebplayersdk-captions-text` directly. This works instantly on Amazon Prime with zero user interaction, guaranteed in sync with audio/video.
     - **Tier 2 (asbplayer Event / API matching)**: If asbplayer has synced subtitles, query cues via `request-current-subtitle` or `request-subtitles` and match against the active cue.
     - **Tier 3 (Playback timestamp matching)**: Match `video.currentTime` to cue `[start, end]` intervals.
2. **asbplayer External API Communication Channel**:
   - The documented `get-bound-media` and `get-subtitles` APIs are exposed over **WebSocket** (port 8766), not standard window postMessage on third-party streaming sites. The internal `request-subtitles` is exposed via `chrome.runtime.sendMessage` (`asbplayerv2` sender).
   - Our extension will support local backend communication, direct Prime DOM observation, and asbplayer integration cleanly.
