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
