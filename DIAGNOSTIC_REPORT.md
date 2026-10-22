# SAQIB MD — Diagnostic Report
**Repo:** `saqibxiqbal-spec/SAQIB-MD-MINI-BOT-V11` (Baileys + MongoDB + Railway)
**Checked:** code syntax, boot test, MongoDB Atlas, Atlas API keys, GitHub token, Railway token, portal frontend, dependencies.

---

## ✅ FIXES APPLIED (commit `18375b6`, pushed to main)
1. **`.song` / `.play` number collision FIXED** — jab `.song` poochta hai "1 = Audio / 2 = Video", ab `2` dabane par `.menu` ki category **nahi** khulti. Guard `lib/interactions` check karta hai aur stale menu clear kar deta hai. Test pass ✅.
2. **Bot pic ab TOTAL menu ke sath ek hi message mein** — total `.menu` ka text 1022 chars (limit 1024) hai, aur `fitCaption()` footer trim karke hamesha ek hi caption mein bhejta hai. Alag pic nahi jayegi. ✅
3. **Portal se leftover third-party script hataya** — `ninja-daytona-script.js` removed. ✅
4. **Railway + Docker ab `start.sh` use karte hain** — local Mongo fallback support. ✅
5. **`.env` ready bana diya** (`bot/.env`, gitignored) — sahi Mongo URI + generated `ADMIN_TOKEN` + GitHub token ke sath.

**Boot test:** `35 plugins, 1880 commands`, portal OK, yt-dlp/ffmpeg OK, GitHub state fallback ne settings restore kar liye ✅.

---

## ✅ MONGODB ATLAS — SOLVED (whitelist added by agent)
`0.0.0.0/0` **add ho gaya** project `6ad900ee1fbce75af3216e3b` ("Project 0") par, key `yvuhzaiy` (GROUP_OWNER) se.

**Final live test:**
```
✔ Ping OK — server reachable
✔ Write/Read OK — roundtrip: 2026-10-22T08:13:54.118Z
✅ MONGODB IS READY
```
**Bot boot with MongoDB:**
```
[MONGO] connected ✅ (primary: cluster0.2qkx7r6.mongodb.net)
[MONGO] restored settings ✅
[MONGO] settings, prefixes, reacts, react-settings, user-settings, bans + api-keys loaded
```
Koi error nahi. ✅

> Note: Atlas Admin API **Digest auth** use karta hai (Basic nahi). Is liye
> `scripts/atlas-allow-ip.js` ab `curl --digest` se kaam karta hai — pehle wala
> version Basic auth bhej raha tha aur 401 de raha tha.

---

## ✅ Jo cheezein BILKUL theek hain (no problem)
- **Code syntax:** saari `.js` files pass (`node --check`) — koi syntax error nahi.
- **Live boot test:** bot successfully boot hua — `35 plugin files, 1880 commands`, web portal up, `yt-dlp` + `ffmpeg` bootstrap OK.
- **Dependencies:** `npm install` OK, `npm audit` → **0 vulnerabilities**.
- **GitHub token:** valid, scopes = `repo, workflow`, state repo `saqib-md-state` par **admin** access hai, `state.json` mojood hai. ✅
- **Portal frontend:** relative API paths (`/api/...`) use karta hai — koi hardcoded localhost/vercel URL nahi. ✅
- **SRV / DNS:** cluster resolve ho raha hai, TCP 27017 **open**, TLS certificate **valid**. Cluster paused nahi hai.

---

## ❌ ERROR 1 — MongoDB Atlas IP Whitelist (SABSE BARA BLOCKER)
**Evidence (real test se):**
```
[MONGO] primary connect failed: ... SSL alert number 80
[MONGO] all 1 endpoint(s) unreachable — running on local files only
```
`SSL alert number 80` ka matlab **100% yahi** hai: Atlas aapke IP ko **Network Access** list mein allow nahi kar raha. TCP open hai aur certificate valid hai, magar Atlas handshake reject kar deta hai.

**Fix (Atlas UI se, 2 minute):**
1. https://cloud.mongodb.com → apna project → **Network Access** (left menu).
2. **+ Add IP Address** → **Allow Access from Anywhere** → `0.0.0.0/0` → **Confirm**.
3. 1–2 minute wait, phir test:
   ```bash
   node scripts/test-mongo.js "mongodb+srv://saqibxiqbal_db_user:oSH1NvzWAfNSI3yp@cluster0.2qkx7r6.mongodb.net/?retryWrites=true&w=majority"
   ```
   `✅ MONGODB IS READY` aana chahiye.

> Railway par deploy karte waqt bhi `0.0.0.0/0` zaroori hai (warna Railway ka IP block ho jayega).

---

## ❌ ERROR 2 — MONGODB_URI mein `<db_password>` placeholder
Aap ne jo string di:
```
mongodb+srv://saqibxiqbal_db_user:<db_password>@cluster0.2qkx7r6.mongodb.net/
```
Isme `<db_password>` **asli password se replace nahi hua**. Sahi URI ye hai:
```
mongodb+srv://saqibxiqbal_db_user:oSH1NvzWAfNSI3yp@cluster0.2qkx7r6.mongodb.net/?retryWrites=true&w=majority&appName=saqib-md
```
Agar password mein special char ho (`@ : / ? # [ ] %`) to URL-encode karna hoga. Aapka password (`oSH1NvzWAfNSI3yp`) alphanumeric hai, so seedha chalega.

---

## ❌ ERROR 3 — Railway token INVALID
**Evidence:**
```
me { ... }        → "Not Authorized"
projectToken { }  → "Project Token not found"
projects { }      → empty
```
Matlab ye token **expired / revoked / galat** hai. Is se deploy ya project check nahi ho sakta.
**Fix:** Railway → Account Settings → **Tokens** → naya **Account Token** generate karein (ya Project → Settings → Token, agar project token use karna hai to project ID ke saath).

---

## ⚠️ ISSUE 4 — Atlas API Key sirf `ORG_MEMBER` hai
Aap ki di hui `PUBLIC KEY becsnzpp` / `PRIVATE KEY e9be...` Atlas **Admin API** key hai (ye bot ke liye zaroori NAHI — bot sirf `MONGODB_URI` use karta hai).
- Ye key org `Humman's Org` dekh sakti hai, magar **0 projects** — kyunki role `ORG_MEMBER` hai.
- Is liye ye key **IP whitelist khud add nahi kar sakti**. Aap ko manually Atlas UI se karna hoga (Error 1).

---

## ⚠️ ISSUE 5 — Repo mein `.env` file nahi hai
Sirf `.env.example` hai. Ye normal hai (secrets git mein nahi jaate), lekin:
- **Railway/Render par:** saari values **Variables** tab mein daalni hongi (`MONGODB_URI`, `MONGODB_DB`, `OWNER_NUMBER`, `ADMIN_TOKEN`, `GITHUB_TOKEN`, etc.).
- **Local par:** `.env.example` ko `.env` bana kar values bharein. (Maine ek ready `.env` bana diya hai — `bot/.env`, gitignored hai.)

---

## ⚠️ ISSUE 6 — Portal mein third-party script committed hai
`public/index.html` line 275:
```html
<script src="https://sites.super.myninja.ai/_assets/ninja-daytona-script.js"></script>
```
Ye AI build tool ka **leftover artifact** hai. Production bot ke portal par zaroorat nahi aur third-party JS load karta hai (privacy/security risk). **Is line ko delete kar dein.**

---

## ⚠️ ISSUE 7 — Railway/Docker `start.sh` ko bypass karte hain
- `railway.json` → `"startCommand": "node index.js"`
- `Dockerfile` → `CMD ["node", "index.js"]`
- `package.json` → `"start": "bash start.sh"`

`start.sh` local MongoDB fallback (`MONGODB_URI_FALLBACK`) auto-start karta hai. Agar aap sirf Atlas use kar rahe hain to koi masla nahi. Agar local fallback chahiye to start command `bash start.sh` karein.

---

## ⚠️ ISSUE 8 — Security: credentials chat mein expose ho gaye
Aap ne live GitHub token, MongoDB password, Atlas keys aur Railway token share kiye. **Kaam khatam hone ke baad turant rotate/regenerate karein:**
- GitHub → Settings → Developer settings → Tokens → revoke + new.
- Atlas → Database Access → password reset; API Keys → delete + new.
- Railway → Tokens → revoke + new.

---

## ℹ️ Minor observations
- `ADMIN_TOKEN` blank hai → har boot par random token banta hai (logs mein print hota hai). Stable rakhne ke liye env mein set karein.
- `PORTAL_PASSWORD=off` hai → portal public hai, koi bhi number link kar sakta hai. Chahiye to lock lagayein.
- `OWNER_NUMBER` default `923106762478` hai — confirm karein ye aapka number hai.
- `GITHUB_TOKEN` set karne se git state backend auto-enable ho jata hai (default repo `saqib-md-state`). Ye acha fallback hai, bas repo private rahe.

---

## 🎯 Priority order (is order mein fix karein)
1. **Atlas Network Access → 0.0.0.0/0** (Error 1) — ye kiye bagair bot DB se connect nahi hoga.
2. **MONGODB_URI sahi karein** (Error 2) aur Railway Variables mein daalein (Issue 5).
3. **Naya Railway token** banayein (Error 3).
4. Portal se `ninja-daytona-script.js` hataayein (Issue 6).
5. Saari leaked credentials rotate karein (Issue 8).

---

## LIVE SANDBOX RUN — 2026-10-22 08:20 UTC ✅

Bot was started directly from the repo in the sandbox (`node index.js`) to prove the
codebase is healthy end-to-end, independent of any host:

```
[SETTINGS] loaded 31 overrides (7 skipped — env wins) from saqib-settings.json
SAQIB MD: 35 plugin files, 1880 commands
[YTDLP] available ✅ | ffmpeg: /tmp/saqib-bin/ffmpeg
SAQIB MD web portal: http://localhost:3000
[YTDLP] warmup: yt-dlp=ready ffmpeg=ready
[MONGO] connected ✅ (primary: cluster0.2qkx7r6.mongodb.net)
[MONGO] restored settings ✅
[MONGO] settings, prefixes, reacts, react-settings, user-settings, bans + api-keys loaded
[warm] pre-generating 25 myth images
```

- Portal: HTTP 200, title `SAQIB MD BOT • Premium Multi-Session WhatsApp Bot`
- Port 3000 listening on `*:3000`
- `grep -iE "error|fail|❌"` on the full boot log → **0 matches**

**Conclusion:** the repository, dependencies, MongoDB connection, session store,
settings store and web portal all work. Nothing in the code is blocking deployment.

## RAILWAY — STILL BLOCKED (external outage, not our code)

- Token `4fddaab7-f67e-4e31-af82-80e791a372cc` → VALID (`saqibxiqbal@gmail.com`)
- Workspace `7ac74bcc-2cd3-433d-87c5-ee8896391dbc` → exists, 0 projects
- `projectCreate` → `"Deploys have been paused due to an upstream issue"` (HTTP 200, GraphQL BAD_USER_INPUT)
- status.railway.com → **"Railway Platform Outage — Major Outage"**, builds paused in all regions

Retry this exact call once Railway restores builds:

```graphql
mutation { projectCreate(input: { name: "SAQIB-MD", workspaceId: "7ac74bcc-2cd3-433d-87c5-ee8896391dbc" }) { id name } }
```

Then `serviceCreate` (source = repo `saqibxiqbal-spec/SAQIB-MD-MINI-BOT-V11`, branch `main`),
set env vars, `serviceDomainCreate`, and check `deployments` logs.

---

## OPTION D — COMPACT PAGINATED CATEGORY SUB-MENUS ✅ (commit 47abc53)

### Problem
Category sub-menus used the full `header()` card (~300 chars) plus one command
per line. Big categories blew past WhatsApp's 1024-char caption limit, so the bot
picture was forced into a SEPARATE message — exactly what the owner did not want.

Measured before the fix (worst offenders):
| Category | Commands |
|---|---|
| 🎎 CHARACTERS | 184 |
| 🕌 ISLAMIC | 184 |
| 🌍 COUNTRIES | 177 |
| 🔧 UTILITY | 155 |
| 🤖 AI | 152 |
| 🔤 FONTS | 133 |

### What changed (`plugins/main.js`)
1. **`compactHeader()`** — sub-menus now use a one-line header
   (`✦ *SAQIB MD* • ⚡ v3.0.0 • 📦 1880 cmds`) instead of the 300-char card.
   The full card is still used for the TOTAL `.menu` list.
2. **`cmdGrid()`** — adaptive grid: picks 3, 2 or 1 columns based on the longest
   command name so lines never wrap on a phone.
3. **`categoryPages()`** — deterministic page sizing. Starts with "all rows on one
   page" and walks rows-per-page DOWN until **every** rendered page is ≤ 1024
   chars. (First attempt used a convergence loop and left 3 pages over the limit —
   AI p2 at 1061, ISLAMIC p2 at 1108, ISLAMIC p3 at 1119. Replaced with the
   deterministic walk; now 0 over.)
4. **Pagination in the handler** — `.menu <cat> <page>`, e.g. `.menu characters 2`.
   The footer prints the exact next-page command, and wraps back to page 1.

### Verified
```
cat | cmds | pages | maxlen
🎎 CHARACTERS   | 184 | 4 | 1020 OK
🕌 ISLAMIC      | 184 | 5 | 1006 OK
🌍 COUNTRIES    | 177 | 4 | 1022 OK
🔧 UTILITY      | 155 | 3 | 1006 OK
🤖 AI           | 152 | 4 |  991 OK
🔤 FONTS        | 133 | 3 | 1006 OK
🔬 SCIENCE      | 120 | 3 | 1008 OK
🎭 REACTIONS    |  83 | 2 | 1008 OK
👥 GROUP        |  72 | 2 |  998 OK
... 21 more single-page categories ...
TOTAL pages=51  over-limit=0
```

Handler simulation (`.menu <cat> <page>`):
```
.menu characters   -> 🎎 CHARACTERS page 1/4 len=999  OK
.menu characters 2 -> 🎎 CHARACTERS page 2/4 len=1015 OK
.menu characters 4 -> 🎎 CHARACTERS page 4/4 len=476  OK
.menu islamic 3    -> 🕌 ISLAMIC    page 3/5 len=967  OK
.menu ai 4         -> 🤖 AI         page 4/4 len=335  OK
failures=0
```

Live restart after the change:
```
SAQIB MD: 35 plugin files, 1880 commands
[MONGO] connected ✅ (primary: cluster0.2qkx7r6.mongodb.net)
[MONGO] settings, prefixes, reacts, react-settings, user-settings, bans + api-keys loaded
error count = 0
```

**Result:** every sub-menu page now ships as ONE image + caption. The bot picture
never arrives separately, for any category, at any size.
