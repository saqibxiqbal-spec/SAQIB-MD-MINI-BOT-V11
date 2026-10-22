# SAQIB MD — Health Check & Fix Report

**Repo:** `saqibxiqbal-spec/SAQIB-MD-MINI-BOT-V11`
**Commit pushed:** `4faa7eb` (on top of `05eabef`)
**Date:** 2026-10-22

---

## Verdict

The bot code is **healthy**. It boots cleanly, the web portal works, MongoDB
connects, all 1,881 commands load, and every test suite is green.

**The one thing that is NOT working is WhatsApp pairing** — no number has ever
completed pairing, so the bot has nothing to connect to. That is a setup step,
not a code bug.

---

## Bugs found and FIXED

### 1. `.antidelete` crashed the handler — `ReferenceError: U is not defined`
`plugins/premium.js` `handler()` used the per-bot settings proxy `U` but only
`onMessage()` defined it. Any of these commands threw:

```
.antidelete            .antidelete inbox     .antidelete chat
.antidelete group      .antidelete all       .antideleteinbox
```

**Fix:** added `const U = userSettings.eff(session?.number);` inside `handler()`.

### 2. Anti-delete status showed the wrong values
`antideleteStatus()` read the shared `config` instead of the per-bot settings, so
right after `.antidelete chat on` the bot replied **"Master: OFF / Yourself
(inbox)"** even though the toggle had been saved.

**Fix:** `antideleteStatus(U)` now renders the live per-bot values. Verified:
`Master: ON 🟢 / Kahan aayega: Chat (jahan delete hua)`.

### 3. Third-party API calls could hang forever
25+ `fetch()` calls in `plugins/` and `lib/` had **no timeout** (carbon, catbox,
pollinations, mail.tm, github codeload, dpaste, paste.rs…). One dead endpoint =
command stuck on "waiting…" indefinitely.

**Fix:** a single global fetch guard in `index.js` wraps `globalThis.fetch` and
attaches `AbortSignal.timeout(FETCH_TIMEOUT_MS)` (default **120 s**) unless the
caller already supplied a signal. Verified: a blackholed IP aborts at exactly
3002 ms with `FETCH_TIMEOUT_MS=3000`.

### 4. Leftover third-party script in the portal
`public/index.html` still loaded
`https://sites.super.myninja.ai/_assets/ninja-daytona-script.js` — an AI build
tool artifact. **Removed.**

### 5. `test/verify-all.js` crashed on a hardcoded path
It wrote to `/workspace/saqib-md/report-all-commands.json`, which does not exist
outside the original build machine. **Fix:** writes to `./reports/` (gitignored).

### 6. Outdated anti-delete test assertions
`scripts/test-fixes.js` still asserted the old shared-`config` behaviour after
the code moved to per-bot settings. **Fix:** asserts `userSettings.eff()` and
also checks the status text.

### 7. `.env.example` gap
`FETCH_TIMEOUT_MS` documented. Now **69/69** env keys documented.

---

## Verification results

| Check | Result |
|---|---|
| `node --check` on every `.js` file | ✅ 0 failures |
| `scripts/audit.js` | ✅ PASS (0 issues) |
| `scripts/test-fixes.js` | ✅ 75 passed, 0 failed |
| `test/features-verify.js` | ✅ 52 passed, 0 failed |
| `test/react-scope-verify.js` | ✅ 26 passed, 0 failed |
| `test/settings-persist.js` | ✅ 9 passed, 0 failed |
| `test/apikey-flow-verify.js` | ✅ 19 passed, 0 failed |
| `test/group-admin-verify.js` | ✅ 4 passed, 0 failed |
| `test/react-menu-integration.js` | ✅ 7 passed, 0 failed |
| `test/verify-all.js` (1,881 commands) | ✅ 0 crashes, 0 silent, 1,187 OK, 685 validation replies, 9 slow image commands |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| Duplicate commands | ✅ 0 (1,881 unique) |
| Hardcoded secrets in code | ✅ 0 |
| Boot log errors | ✅ 0 |
| Portal | ✅ HTTP 200 |
| MongoDB | ✅ connected, settings + sessions restored |
| Pairing API | ✅ code + QR generated (`POST /api/pair`) |

---

## Still open (not code bugs)

### A. No WhatsApp number is paired
MongoDB `saqib_md.sessions` held 6 entries, **all with `registered: false`** —
half-finished pairing attempts. The bot correctly refuses to restore them
(restoring them would cause WhatsApp `401` loops).

Cleaned up 5 junk test entries (`923000000001`–`4`, `923000000009`).
Remaining real attempts, all unregistered:

```
923008760205   923067846267   923106762478   923134182952
```

**Action:** open the portal, enter a number, then on the phone go to
WhatsApp → Linked devices → Link with phone number → type the 8-character code.
Pairing must finish within 2 minutes.

### B. Railway is connected but empty
Account token is valid (`saqibxiqbal@gmail.com`), workspace
`7ac74bcc-2cd3-433d-87c5-ee8896391dbc`, **0 projects**. Nothing deployed yet.

### C. Portal is public
`PORTAL_PASSWORD=off` — anyone with the URL can start a pairing. Set
`PORTAL_PASSWORD` to any value to lock it.

### D. Rotate the leaked credentials
GitHub PAT, MongoDB password, Atlas API keys and Railway tokens were all pasted
into chat. Rotate all of them.

---

## Recommended Railway variables

```
BOT_NAME=SAQIB MD
PREFIX=.
OWNER_NUMBER=<your number, no +>
OWNER_NAME=I'm Saqib king 👑
ADMIN_TOKEN=<long random string>
PORTAL_PASSWORD=<set this, do not leave off in production>
MODE=public
PORT=3000
MONGODB_URI=mongodb+srv://saqibxiqbal_db_user:<password>@cluster0.2qkx7r6.mongodb.net/?retryWrites=true&w=majority&appName=saqib-md
MONGODB_DB=saqib_md
GITHUB_TOKEN=<new PAT>
GITHUB_STATE_REPO=saqibxiqbal-spec/saqib-md-state
MAX_SESSIONS=500
TIMEZONE=Asia/Karachi
FETCH_TIMEOUT_MS=120000
```

`railway.json`, `Dockerfile` and `package.json` all agree on `bash start.sh`,
and `start.sh` only launches a local mongod when `MONGODB_URI_FALLBACK` points at
`127.0.0.1` — so Atlas-only deployments are unaffected.
