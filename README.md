# 🎬 StreamTutor — German Video Immersion & Flashcards

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10%2B-brightgreen.svg)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-orange.svg)](https://developer.chrome.com/docs/extensions/)
[![Docker Ready](https://img.shields.io/badge/Docker-Compatible-2496ED.svg)](https://www.docker.com/)

**StreamTutor** is a lightweight, contextual language-learning companion for watching German-dubbed and German-subtitled shows and movies (Amazon Prime Video, Netflix, and more).

Unlike generic dual-subtitle tools that flood your screen with text and block the action, StreamTutor provides an **ultra-slim**, **CEFR-filtered** immersion layer with **Yomitan-style word inspection** and **1-click flashcard saving** to a local file ready for your favorite flashcard apps (such as [Wortlaut](https://github.com/sabers13/wortlaut-app) or [Anki](https://apps.ankiweb.net/)).

---

## ✨ Key Features

- 🧠 **Smart CEFR Threshold Filtering**: Set your current German level (e.g. `A2`) and your desired threshold (e.g. `B1+`). Basic sentences you already understand stay untouched so you can enjoy the movie; sentences at or above your threshold display clean translations and grammar notes.
- 🔍 **Yomitan-Style Word Marking**: Click *any* German word in the subtitle to mark it with an amber glow and open a floating definition popover. Text is fully selectable for compatibility with third-party extensions.
- 🎴 **1-Click Flashcards (Wortlaut & Anki Ready)**: Save any word or full sentence in 1 click. Cards are permanently saved to disk at `backend/data/saved_flashcards.csv` (and local SQLite). They stay indefinitely until you export them, surviving browser and PC restarts.
- 💡 **On-Demand AI Explanations**: Click *"✨ Deep Explanation (AI)"* when you encounter tricky grammar for a focused, conversational breakdown (<50 words).
- 🪶 **Ultra-Slim Non-Intrusive Overlay**: Semi-transparent card (~50px height) matching native video subtitles. Background clicks pass straight through (`pointer-events: none`) so video player controls and the time scrubber remain 100% accessible.
- ⚡ **100% Offline & Free Out of the Box**: Ships with a fast, zero-dependency deterministic German grammar and vocabulary engine. Works completely offline with zero API keys required.

---

## 🚀 Quick Start & Installation (Any Operating System)

StreamTutor consists of two parts:
1. **The Backend Server** (FastAPI analyzing difficulty, translations, and persistent flashcard storage)
2. **The Chrome Extension** (detects subtitles on Prime Video/Netflix and renders the overlay)

---

### 1. Starting the Backend Server

Choose the method that fits your setup:

#### 🐳 Option A: Docker (Windows, macOS, Linux — Recommended, Zero Setup)

If you have Docker installed, run a single command from the project root:

```bash
docker compose up -d
```

- Server starts at `http://127.0.0.1:8000`
- SQLite database and `saved_flashcards.csv` are automatically persisted to `./backend/data` on your host machine.
- To stop: `docker compose down`

---

#### 🪟 Option B: Windows (1-Click Launcher)

1. Double-click **`start.bat`** in the project folder (or run `start.bat` in Command Prompt / PowerShell).
2. The script will automatically:
   - Detect Python 3.10+
   - Create a local virtual environment in `backend\.venv`
   - Install all required dependencies
   - Start the StreamTutor API on `http://127.0.0.1:8000`

---

#### 🍎 / 🐧 Option C: macOS & Linux (1-Click Script)

Open your terminal and run:

```bash
./start.sh
```

*(Or manual setup if you prefer)*:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

#### Linux: Start automatically at login

On a Linux desktop that uses systemd, install the included user service from the project root:

```bash
./scripts/install-user-service.sh
```

The installer prepares the Python environment if needed, starts the backend now, and enables it for future logins. The service restarts automatically if the backend crashes. You can check it with `systemctl --user status streamtutor-backend.service` or open `http://127.0.0.1:8000/health`. It listens only on your computer.

To stop it for the current session, run `systemctl --user stop streamtutor-backend.service`. To turn off automatic startup, run `systemctl --user disable --now streamtutor-backend.service`.

---

### 2. Installing the Chrome Extension

1. **Get the extension files**:
   - **From GitHub Releases**: Download `streamtutor-extension.zip`, unzip it to any folder.
   - *OR Build from source*:
     ```bash
     cd extension
     npm install
     npm run build
     ```
     *(The compiled extension will be in `extension/dist/`)*
2. **Load into your browser** (Chrome, Brave, Edge, Opera, Vivaldi):
   - Open your browser and navigate to: `chrome://extensions`
   - Enable **Developer mode** (toggle in the top-right corner).
   - Click **"Load unpacked"**.
   - Select the `extension/dist` folder (or the unzipped release folder).
3. **Pin StreamTutor**: Click the puzzle icon in your browser toolbar and pin **StreamTutor**.

---

## 🎮 Testing in the Local Video Sandbox

You don't need an active streaming subscription to test StreamTutor! We provide an interactive local video sandbox that simulates streaming video captions.

1. Ensure the backend is running (`http://127.0.0.1:8000`).
2. Open the test page:
   - Either click **"Open Local Test Page"** in the StreamTutor extension popup menu.
   - Or open `http://127.0.0.1:8000/test-page` in your browser.
3. Click any dialogue button (e.g. **Sentence 1 [B1]**):
   - Notice the ultra-slim overlay appears.
   - Click on the word **`wovon`**: the word glows in amber and the Yomitan-style popover opens with definition and **`[➕ Save Flashcard]`**.
   - Click **`[➕ Save Flashcard]`**: the button turns into **`✓ Saved! (CSV & Anki)`**.
   - Check `backend/data/saved_flashcards.csv` to see your saved card!

---

## 🎴 Flashcard Export & Wortlaut / Anki Integration

### Compatibility with Wortlaut
StreamTutor is designed to work hand-in-hand with [Wortlaut](https://github.com/sabers13/wortlaut-app). Every saved card automatically formats columns to:
```csv
German,English,Type,Example_Sentence,Sentence_Translation,Grammar_Note,CEFR_Level,Source,Created_At
```

### How to Export:
- **Via Extension Popup**: Click the StreamTutor icon in your browser toolbar and click **`📥 Download CSV (for Wortlaut & Anki)`**.
- **Via Direct File**: The cards are always saved on disk at `backend/data/saved_flashcards.csv`.
- **Via AnkiConnect**: If Anki Desktop is running with the [AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on, StreamTutor automatically pushes cards into your `German::StreamTutor` deck in the background.

---

## ⚙️ Configuration & Optional AI Engine

StreamTutor works 100% offline by default using its deterministic German grammar analyzer.

If you would like to enable deep generative AI grammar breakdowns:
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Set your desired provider and API key:
   ```ini
   ANALYZER_PROVIDER=opencode   # or 'gemini', 'deepseek', 'deterministic'
   OPENCODE_API_KEY=your_key_here
   ```

---

## 🏗️ Project Architecture

```text
streamtutor/
├── README.md                # Project documentation & quick start
├── Dockerfile               # Production multi-stage Docker build
├── docker-compose.yml       # 1-command container orchestration
├── start.sh                 # macOS & Linux 1-click launcher
├── start.bat                # Windows 1-click launcher
├── .env.example             # Configuration template
├── backend/
│   ├── app/
│   │   ├── analyzers/       # CEFR rule engine & optional AI providers
│   │   ├── cache.py         # SQLite persistent analysis cache
│   │   ├── config.py        # Settings & environment variables
│   │   ├── flashcards.py    # Persistent flashcard manager (CSV + SQLite + Anki)
│   │   ├── main.py          # FastAPI endpoints (/analyze-sentence, /lookup-word, /save-flashcard)
│   │   ├── models.py        # Pydantic schemas
│   │   └── translator.py    # Zero-key fallback dictionary
│   ├── data/                # Persistent SQLite database and saved_flashcards.csv
│   ├── tests/               # 20 automated unit & integration tests
│   ├── requirements.txt     # Python dependencies
│   └── pyproject.toml
├── extension/
│   ├── public/
│   │   ├── manifest.json    # Manifest V3 configuration
│   │   ├── content.css      # Ultra-slim overlay & Yomitan word popover styles
│   │   └── popup.html / css # Extension popup settings & flashcard export UI
│   ├── src/
│   │   ├── content/index.ts # Content script injected into video pages
│   │   ├── popup/index.ts   # Extension popup logic
│   │   ├── services/        # Backend client & video caption observer
│   │   └── ui/overlay.ts    # Yomitan-style word tokenization & popover manager
│   ├── build.js             # Fast esbuild bundler
│   └── package.json
├── test-page/               # Local standalone video subtitle testing sandbox
└── scripts/
    └── package-extension.sh # Releases zip packaging utility
```

---

## 🧪 Running Automated Tests

Run the full backend test suite:

```bash
cd backend
pytest -v
```

All 20 unit and integration tests (CEFR ranking, deterministic grammar analyzer, subtitle normalizer, caching, and flashcard APIs) will execute in < 1 second.

---

## 📄 License

MIT License. Feel free to use, modify, and distribute for your own language learning journey!
