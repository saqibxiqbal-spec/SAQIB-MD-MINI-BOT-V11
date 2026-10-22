#!/usr/bin/env bash
# SAQIB MD launcher.
# 1. If MONGODB_URI_FALLBACK points at a local mongod, make sure it is running.
# 2. Start the bot.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs

LOCAL_URI="$(grep -E '^MONGODB_URI_FALLBACK=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"

if [[ "$LOCAL_URI" == mongodb://127.0.0.1:* || "$LOCAL_URI" == mongodb://localhost:* ]]; then
  PORT="${LOCAL_URI##*:}"
  PORT="${PORT%%/*}"
  if ! (echo > "/dev/tcp/127.0.0.1/${PORT}") 2>/dev/null; then
    echo "[start] local MongoDB not running — launching it on port ${PORT}…"
    nohup node mongod-local.js >> logs/mongod.log 2>&1 &
    for _ in $(seq 1 30); do
      sleep 1
      if (echo > "/dev/tcp/127.0.0.1/${PORT}") 2>/dev/null; then
        echo "[start] local MongoDB is up ✅"
        break
      fi
    done
  else
    echo "[start] local MongoDB already running on port ${PORT} ✅"
  fi
fi

exec node index.js
