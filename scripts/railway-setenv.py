#!/usr/bin/env python3
"""
SAQIB MD — set Railway environment variables for the production service.

Usage:
    RAILWAY_TOKEN=<project-token> python3 scripts/railway-setenv.py

Never hard-code tokens here. The token is read from the environment.
"""
import json, os, urllib.request, urllib.error

TOKEN = os.environ.get("RAILWAY_TOKEN", "").strip()
if not TOKEN:
    raise SystemExit("Set RAILWAY_TOKEN env var first (Railway → Project → Settings → Tokens).")

# Railway project / environment / service IDs. These are specific to YOUR
# project — set them in the environment (Railway → Project → Settings).
PROJECT = os.environ.get("RAILWAY_PROJECT_ID", "").strip()
ENV = os.environ.get("RAILWAY_ENVIRONMENT_ID", "").strip()
SERVICE = os.environ.get("RAILWAY_SERVICE_ID", "").strip()
if not (PROJECT and ENV and SERVICE):
    raise SystemExit("Set RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID and RAILWAY_SERVICE_ID env vars first.")

variables = {
    "PORT": "3000",
    "MODE": "public",            # public | private
    "MAX_SESSIONS": "500",       # up to 500 numbers
    "BOT_NAME": "SAQIB MD",
    "OWNER_NAME": "I'm Saqib king 👑",
    "OWNER_NUMBER": "923106762478",   # primary owner number
    "CHANNEL_LINK": "",               # apna channel link daalein (optional)
    "GROUP_LINK": "",                 # apna group link daalein (optional)
    "PREFIX": ".",
    "SESSION_DIR": "/data/session",   # Railway volume (persists logins)
    # --- all auto/anti features DEFAULT OFF ---
    "AUTO_READ": "false",
    "AUTO_TYPING": "false",
    "AUTO_REACT": "false",
    "WELCOME": "false",
    "GOODBYE": "false",
    "ANTILINK": "false",
    "ANTIDELETE": "false",
    "ANTIDELETE_INBOX": "false",
    "ANTISPAM": "false",
    "ANTICALL": "false",
    "AUTOSTATUS": "false",
    "AUTOVIEWONCE": "true",
    "AUTOBIO": "false",
    "CHATBOT": "false",
    "AUTOREAD_STATUS": "false",
    "ONLINE": "true",
    "RECORDING": "false",
    "STATUSVIEW": "false",
    "ADMINISTRATION": "false",
    "MENTION_REPLY": "false",
}

query = "mutation Upsert($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }"
payload = {
    "query": query,
    "variables": {"input": {
        "projectId": PROJECT, "environmentId": ENV, "serviceId": SERVICE,
        "replace": False, "skipDeploys": True, "variables": variables,
    }},
}
req = urllib.request.Request(
    "https://backboard.railway.app/graphql/v2",
    data=json.dumps(payload).encode(),
    headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print(r.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode())
