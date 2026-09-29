#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "  🎬 StreamTutor Backend — Starting up (macOS / Linux)    "
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
VENV_DIR="$BACKEND_DIR/.venv"

# Check Python 3
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed or not in your PATH."
    echo "Please install Python 3.10+ (https://www.python.org/downloads/) and try again."
    exit 1
fi

# Create virtual environment if missing
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Creating virtual environment in $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
fi

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Install/Update dependencies
echo "📥 Checking and installing Python dependencies..."
pip install -q --upgrade pip
pip install -q -r "$BACKEND_DIR/requirements.txt"

echo "✅ Dependencies ready."
echo "🚀 Starting StreamTutor API server on http://127.0.0.1:8000..."
echo "👉 Health check: http://127.0.0.1:8000/health"
echo "👉 Local video sandbox: http://127.0.0.1:8000/test-page (or test-page/index.html)"
echo "Press Ctrl+C to stop."
echo "=========================================================="

cd "$BACKEND_DIR"
exec uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
