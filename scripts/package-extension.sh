#!/usr/bin/env bash
set -e

echo "📦 Packaging StreamTutor Chrome Extension..."

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="$ROOT_DIR/extension"

cd "$EXT_DIR"
npm run build

ZIP_NAME="streamtutor-extension.zip"
rm -f "$ZIP_NAME"

cd dist
zip -r "../$ZIP_NAME" ./*

echo "✅ Extension packaged successfully: extension/$ZIP_NAME"
echo "You can attach this zip file to your GitHub Releases for 1-click user downloads!"
