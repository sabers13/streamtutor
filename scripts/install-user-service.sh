#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
backend_dir="$repo_dir/backend"
uvicorn="$backend_dir/.venv/bin/uvicorn"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
unit_file="$unit_dir/streamtutor-backend.service"

if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemd is required for this Linux login service." >&2
    exit 1
fi

if [[ ! -x "$uvicorn" ]]; then
    echo "Preparing the StreamTutor Python environment..."
    python3 -m venv "$backend_dir/.venv"
    "$backend_dir/.venv/bin/python" -m pip install -r "$backend_dir/requirements.txt"
fi

mkdir -p "$unit_dir"
python3 - "$repo_dir/scripts/systemd/streamtutor-backend.service.in" "$unit_file" "$backend_dir" "$uvicorn" <<'PY'
from pathlib import Path
import sys

template_path, unit_path, backend_dir, uvicorn = sys.argv[1:]

def escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("%", "%%")

template = Path(template_path).read_text(encoding="utf-8")
unit = template.replace("@BACKEND_DIR@", escape(backend_dir))
unit = unit.replace("@UVICORN@", escape(uvicorn))
Path(unit_path).write_text(unit, encoding="utf-8")
PY

systemctl --user daemon-reload
systemctl --user enable streamtutor-backend.service
systemctl --user restart streamtutor-backend.service
systemctl --user --no-pager status streamtutor-backend.service
