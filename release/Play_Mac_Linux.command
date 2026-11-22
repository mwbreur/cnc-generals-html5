#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PORT=8080
URL="http://localhost:${PORT}"

echo "===================================================================="
echo "  Command & Conquer: Generals HTML5 Edition — Local Launcher"
echo "===================================================================="
echo ""

open_browser() {
  sleep 1
  if command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
}

if command -v node >/dev/null 2>&1; then
  echo "[OK] Node.js detected! Starting full Offline + LAN Multiplayer server..."
  echo "     Opening $URL in your browser..."
  echo "     (Keep this window open while playing. Press Ctrl+C to stop.)"
  echo ""
  open_browser &
  exec node scripts/lan_server.mjs --no-build --port="$PORT"
elif command -v python3 >/dev/null 2>&1; then
  echo "[OK] Python 3 detected! Starting Offline Skirmish server..."
  echo "     (Tip: Install Node.js from https://nodejs.org for LAN Multiplayer.)"
  echo "     Opening $URL in your browser..."
  echo "     (Keep this window open while playing. Press Ctrl+C to stop.)"
  echo ""
  open_browser &
  exec python3 -m http.server "$PORT"
else
  echo "[ERROR] Neither Node.js nor Python 3 was found."
  echo "        Please install Node.js (https://nodejs.org) and run this launcher again."
  read -r -p "Press Enter to exit..."
  exit 1
fi
