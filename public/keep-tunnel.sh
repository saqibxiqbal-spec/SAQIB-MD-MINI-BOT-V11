#!/usr/bin/env bash
# Keeps the Cloudflare quick tunnel alive and records the current public URL.
set -uo pipefail
LOG=/tmp/cf.log
URLFILE=/workspace/pairing-site/LIVE-LINK.txt

while true; do
  if ! pgrep -f "cloudflared tunnel --url" >/dev/null 2>&1; then
    echo "[watchdog] $(date -u +%H:%M:%S) starting cloudflared" >> /tmp/cf-watchdog.log
    : > "$LOG"
    nohup /tmp/cloudflared tunnel --url http://127.0.0.1:3000 --no-autoupdate >> "$LOG" 2>&1 &
    sleep 10
    URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$LOG" | head -1)
    if [ -n "${URL:-}" ]; then
      echo "$URL" > "$URLFILE"
      echo "[watchdog] $(date -u +%H:%M:%S) live at $URL" >> /tmp/cf-watchdog.log
    fi
  fi
  sleep 20
done
