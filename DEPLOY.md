# 🚀 SAQIB MD — Deployment Guide

Everything you need to run **SAQIB MD** in the cloud, with **MongoDB Atlas**
persistence and a **premium web pairing portal**.

---

## 1. MongoDB Atlas (database)

The bot works with **zero config** (it falls back to a local JSON store), but to
persist settings + sessions across redeploys you need a MongoDB URI.

### 1.1 Create the cluster (if you don't have one)
1. Go to <https://cloud.mongodb.com> → **Build a Database** → **M0 (Free)**.
2. Pick any region → **Create**.

### 1.2 Create a database user
1. **Database Access** → **Add New Database User**.
2. Username: `saqibxiqbal_db_user` (or your own).
3. Password: click **Autogenerate** or set your own → **Add User**.
   > If your password contains special characters (`@ : / ? # [ ] %`), you must
   > **URL-encode** them in the URI. Example: `@` → `%40`.

### 1.3 Allow network access
1. **Network Access** → **Add IP Address**.
2. For a cloud host (Railway/Render/etc.) choose **Allow Access from Anywhere**
   (`0.0.0.0/0`) → **Confirm**.

### 1.4 Copy the connection string
1. **Database** → **Connect** → **Drivers** → **Node.js**.
2. Copy the string. It looks like:
   ```
   mongodb+srv://saqibxiqbal_db_user:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=saqib-md
   ```
3. Replace `<password>` with your real password.

### 1.5 Test it locally
```bash
npm install
node scripts/test-mongo.js "mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
```
You should see `✅ MONGODB IS READY`.

---

## 2. Environment variables

Copy `.env.example` → `.env` and fill in the values. The important ones:

| Variable          | What it does                                                        |
| ----------------- | ------------------------------------------------------------------- |
| `MONGODB_URI`     | Atlas connection string (from step 1.4)                             |
| `MONGODB_DB`      | Database name (default `saqib_md`)                                  |
| `ADMIN_TOKEN`     | Protects the **Owner** panel in the portal (list/remove sessions)   |
| `PORTAL_PASSWORD` | `off` = public portal, any value = lock screen for the whole portal |
| `OWNER_NUMBER`    | Your WhatsApp number, digits only (e.g. `923106762478`)             |
| `BOT_NAME`        | Display name (default `SAQIB MD`)                                   |
| `PORT`            | Web port (hosts set this automatically)                             |

> If `ADMIN_TOKEN` is left blank, a strong random token is generated at boot and
> printed to the logs — set it explicitly to keep it stable.

---

## 3. Deploy on Railway

> ⚠️ Railway was in a **major outage** ("builds paused") when this guide was
> written. The steps below are ready to run the moment it recovers.

### Option A — Dashboard (easiest)
1. <https://railway.app/new> → **Deploy from GitHub repo** → pick
   `SAQIB-MD-MINI-BOT-V11`.
2. Railway auto-detects Node (or uses the included `Dockerfile`).
3. **Variables** tab → add `MONGODB_URI`, `MONGODB_DB`, `ADMIN_TOKEN`,
   `PORTAL_PASSWORD=off`, `OWNER_NUMBER`.
4. **Settings → Networking → Generate Domain** → open the URL. Done ✅

### Option B — CLI
```bash
npm i -g @railway/cli
railway login                 # or: railway login --token <YOUR_TOKEN>
railway init                  # create/link a project
railway up                    # build + deploy from the current folder
railway variables set MONGODB_URI="mongodb+srv://..." MONGODB_DB=saqib_md \
  ADMIN_TOKEN=your-token PORTAL_PASSWORD=off OWNER_NUMBER=923106762478
railway domain                # generate a public URL
```

### Option C — GraphQL API (token)
```bash
curl -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { projectCreate(input:{name:\"SAQIB-MD\"}) { id } }"}'
```

The repo already ships `railway.json` + `Dockerfile`, so no extra setup is needed.

---

## 4. Alternative hosts (no Railway needed)

| Host        | How                                                                    |
| ----------- | ---------------------------------------------------------------------- |
| **Render**  | New → Web Service → connect repo → `render.yaml` is auto-detected.     |
| **Koyeb**   | New App → GitHub → Dockerfile → add env vars → deploy.                 |
| **Fly.io**  | `fly launch` (uses the Dockerfile) → `fly secrets set MONGODB_URI=...` |
| **VPS/Docker** | `docker build -t saqib-md . && docker run -p 3000:3000 --env-file .env saqib-md` |
| **Local**   | `npm install && npm start` → open `http://localhost:3000`              |

All of them read the **same environment variables** from section 2.

---

## 5. Pairing a number (using the portal)

1. Open the deployed URL.
2. Enter your WhatsApp number **with country code** (e.g. `923106762478`).
3. Click **Link a Number** → an **8-digit pairing code** appears (valid ~2 min).
4. On your phone: **WhatsApp → Settings → Linked Devices → Link a Device →
   Link with phone number instead** → type the code.
5. The portal flips to **Connected** and the bot goes live. 🎉

Up to **500 numbers** can be linked to the same bot.

---

## 6. Troubleshooting

| Symptom                        | Fix                                                              |
| ------------------------------ | ---------------------------------------------------------------- |
| `[SETTINGS] no MONGODB_URI`    | Set `MONGODB_URI` in the host env (section 2).                   |
| Mongo `Server selection timed out` | Atlas → Network Access → allow `0.0.0.0/0`.                  |
| Mongo `Authentication failed`  | Wrong user/pass, or password not URL-encoded.                    |
| Pairing code rejected          | Code expired (~2 min) — generate a fresh one.                    |
| Owner panel says Unauthorized  | Enter your `ADMIN_TOKEN` in the Owner tab.                       |
| Port errors on a host          | Don't hardcode `PORT`; hosts inject it. The app reads `process.env.PORT`. |
