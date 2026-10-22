# SAQIB MD — Pairing Portal

A premium, permanent pairing website for the **SAQIB MD** WhatsApp bot. It talks
directly to the bot's real Express API, so whatever you see is live — no mock
data, no fake counters.

```
pairing-site/
├── index.html   markup (semantic, accessible, no frameworks)
├── styles.css   design system (deep-space glassmorphism + aurora motion)
├── app.js       pairing logic (code, QR, SSE + polling, sessions)
└── README.md    this file
```

Zero dependencies. No CDN, no external fonts, no tracking. It works on a slow
connection and fully offline once cached.

---

## What it does

| Feature | How |
| --- | --- |
| **8-digit pairing code** | `POST /api/pair` → animated digit tiles + copy button |
| **Scannable QR** | `GET /api/qr?text=…` → server-rendered SVG, shown as an image |
| **Live link status** | `GET /api/pair/stream` (SSE) with `GET /api/pair/state` polling as a fallback |
| **Countdown** | SVG progress ring driven by `expiresIn`, turns amber → red as it runs out |
| **Already-linked numbers** | `ALREADY_LINKED` is treated as success, never a red error |
| **Session manager** | `GET /api/sessions` + `POST /api/session/remove`, gated by `ADMIN_TOKEN` |
| **Reset a stuck attempt** | `POST /api/pair/reset` |
| **Multi-deployment** | link icon (top right) lets you point the page at any bot URL |

---

## Two ways to run it

### 1. Served by the bot (recommended — permanent, zero config)

The bot already serves `public/` on its own port:

```bash
cp index.html styles.css app.js  ../bot/public/
```

Then open the bot's URL. The page detects same-origin and talks to `/api/*`
directly. The old portal is preserved at `/legacy.html`.

### 2. Static hosting (shareable link)

Upload `index.html`, `styles.css`, `app.js` to any static host. On first load
the page shows **Bot offline** — click the link icon in the top-right corner and
paste your bot's public URL (e.g. `https://your-bot.up.railway.app`). It is
stored in `localStorage`, so it only has to be done once per browser.

The bot sends `Access-Control-Allow-Origin: *`, so cross-origin calls work out
of the box. The owner token is passed as `?token=` because the bot's CORS policy
only allows the `Content-Type` header.

---

## Owner view

Connected numbers are private. Without a token the page only shows the count.
Click **Unlock owner view** and paste your `ADMIN_TOKEN` (from `.env`) to see
numbers, statuses, and the remove button. The token never leaves the browser
except as a query parameter to your own bot.

---

## Deep link

`?number=923106762478` pre-fills the field and immediately requests a code —
handy for QR codes, buttons, or a WhatsApp auto-reply.

---

## Design notes

- Dark palette with an emerald accent (`#22e08a`) and violet secondary.
- Animated aurora blobs + a subtle grain layer so gradients never band on OLED.
- Gradient-border glass cards, shimmer sweep on the primary button, staggered
  digit pop-in, and a scan line across the code box.
- `prefers-reduced-motion` disables every animation.
- Mobile breakpoint at 560px: labels collapse, digits shrink, QR resizes.
- Uses `100dvh` so mobile browser chrome doesn't cause overflow.

---

## API contract used

```
GET  /api/status                     → { ok, status, connected, uptime, botName, connectedCount, maxSessions }
GET  /api/sessions?token=            → { ok, locked, count, sessions[], max }
POST /api/session/remove             → { ok, removed }            body: { number, token }
POST /api/pair                       → { ok, code, number, qr, status, expiresIn }
POST /api/pair                       → { ok, alreadyLinked:true, number, status }  (already linked)
GET  /api/pair/state?number=         → { ok, status, code, qr, connected, error, expiresIn }
POST /api/pair/reset                 → { ok, number, message }     body: { number }
GET  /api/pair/stream?number=        → SSE: starting | qr | code | linking | paired | error
GET  /api/qr?text=&size=             → image/svg+xml
```
