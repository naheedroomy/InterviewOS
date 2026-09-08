#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:-/Applications/AnswerCue.app}"

echo "==> Resetting macOS permissions and quarantine for AnswerCue..."

# 1. Reset TCC permissions for Microphone and ScreenCapture
echo "--> Resetting TCC permissions (Microphone & ScreenCapture)..."
tccutil reset Microphone || true
tccutil reset ScreenCapture || true

# 2. Clear quarantine and extended attributes
if [ -d "$APP_PATH" ]; then
  echo "--> Removing quarantine and extended attributes from: $APP_PATH"
  sudo xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true
  sudo xattr -cr "$APP_PATH" 2>/dev/null || true
  echo "✓ Quarantine and extended attributes cleared for $APP_PATH"
else
  echo "⚠️  App not found at '$APP_PATH'. If AnswerCue is located elsewhere, pass the path as an argument: $0 /path/to/AnswerCue.app"
fi

echo "==> Done!"
