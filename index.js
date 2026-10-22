/**
 * SAQIB MD — Premium WhatsApp Bot
 * Single process: web pairing portal + WhatsApp bot (multi-session).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const mongo = require('./lib/mongo');
// Load persisted runtime overrides (toggles survive restarts/redeploys).
const settings = require('./lib/settings');
const prefixes = require('./lib/prefixes');
const reacts = require('./lib/reacts');
const reactSettings = require('./lib/reactSettings');
const userSettings = require('./lib/userSettings');
const bans = require('./lib/bans');
const apikeys = require('./lib/apikeys');
settings.load();
prefixes.load();
reacts.load();
reactSettings.load();
userSettings.load();
bans.load();
apikeys.load();
const registry = require('./plugins/_registry');
const bot = require('./lib/bot');
const QRCode = require('qrcode');

// ---------------------------------------------------------------------------
// Load plugins
// ---------------------------------------------------------------------------
const pluginsDir = path.join(__dirname, 'plugins');
const plugins = [];
for (const f of fs.readdirSync(pluginsDir).filter((x) => x.endsWith('.js') && !x.startsWith('_'))) {
  try {
    const plug = require(path.join(pluginsDir, f));
    if (Array.isArray(plug.commands) && typeof plug.handler === 'function') {
      plugins.push({ file: f, ...plug });
    }
  } catch (e) {
    console.error('plugin load fail:', f, e.message);
  }
}
registry.set(plugins);
const totalCmds = plugins.reduce((n, p) => n + p.commands.length, 0);
console.log(`${config.BOT_NAME}: ${plugins.length} plugin files, ${totalCmds} commands`);

// If no ADMIN_TOKEN was configured, config.js generated a strong random one.
// Print it ONCE at boot so the owner can still reach the private portal area.
if (config.ADMIN_TOKEN_GENERATED) {
  console.log(`[ADMIN] no ADMIN_TOKEN set \u2014 generated a random portal admin token: ${config.ADMIN_TOKEN}`);
  console.log('[ADMIN] set ADMIN_TOKEN in your env to keep it stable across restarts.');
}

// Downloader engine + periodic temp cleanup
const ytdlp = require('./lib/ytdlp');
const media = require('./lib/media');
console.log(`[YTDLP] ${ytdlp.available() ? 'available ✅' : 'NOT found ❌'} | ffmpeg: ${media.ffmpegPath() || 'will bootstrap'}`);
setInterval(() => ytdlp.cleanup(), 15 * 60 * 1000).unref?.();
// Ensure the downloader binaries exist even on hosts without apt (a plain
// plain Node buildpack). Non-blocking — the bot boots instantly and the
// binaries download in the background, so the first download just works.
ytdlp.warmup().catch(() => {});

// ---------------------------------------------------------------------------
// Web server (pairing portal + health)
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS — lets the Vercel pairing site call this backend directly.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
// Serve the bot picture (assets/bot.jpg) so the portal can show the real DP.
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/health', (req, res) => {
  const s = bot.getStatus();
  res.json({ ok: true, bot: config.BOT_NAME, version: config.BOT_VERSION, status: s.status, connected: s.connected, uptime: s.uptime, sessions: s.connectedCount });
});

// Build marker — lets us confirm which code is actually live (deploy check).
const BUILD = process.env.BUILD_MARKER || 'watchdog+lastUpdate+diag';
app.get('/api/version', (req, res) => {
  res.json({ ok: true, bot: config.BOT_NAME, version: config.BOT_VERSION, build: BUILD, node: process.version, pid: process.pid, uptime: bot.getStatus().uptime });
});

// Session-dir diagnostic — shows exactly what is stored on the volume so we
// can tell whether a number is linked (creds.json + registered) or not.
app.get('/api/session-dir', (req, res) => {
  const base = path.resolve(config.SESSION_DIR);
  const entries = [];
  try {
    for (const d of fs.readdirSync(base)) {
      const p = path.join(base, d);
      let isDir = false;
      try { isDir = fs.statSync(p).isDirectory(); } catch { /* ignore */ }
      let hasCreds = false, registered = false, me = null, files = 0;
      if (isDir) {
        try { files = fs.readdirSync(p).length; } catch { /* ignore */ }
        try {
          const c = JSON.parse(fs.readFileSync(path.join(p, 'creds.json'), 'utf8'));
          hasCreds = true; registered = !!c.registered; me = c?.me?.id || null;
        } catch { /* no creds.json */ }
      }
      entries.push({ name: d, isDir, files, hasCreds, registered, me });
    }
  } catch (e) {
    return res.json({ ok: false, dir: base, error: e?.message || String(e) });
  }
  res.json({ ok: true, dir: base, entries });
});

app.get('/api/status', (req, res) => {
  res.json({ ok: true, ...bot.getStatus() });
});

// ---- Owner-only guard ------------------------------------------------------
// Connected numbers are private: only the owner (who knows ADMIN_TOKEN) may
// list them or remove a session. Everyone else only sees the count.
const ADMIN_TOKEN = String(config.ADMIN_TOKEN || '');
// Password that protects the whole portal (lock screen). "off"/"none"/"0"
// disables the lock screen entirely.
const PORTAL_PASSWORD_RAW = String(config.PORTAL_PASSWORD || '').trim();
const PORTAL_LOCKED = !!PORTAL_PASSWORD_RAW && !['off', 'none', '0', 'false', 'disable', 'disabled'].includes(PORTAL_PASSWORD_RAW.toLowerCase());
const PORTAL_PASSWORD = PORTAL_LOCKED ? PORTAL_PASSWORD_RAW : '';
function tokenOk(t) {
  const v = String(t || '').trim();
  if (!v) return false;
  return (!!ADMIN_TOKEN && v === ADMIN_TOKEN) || (!!PORTAL_PASSWORD && v === PORTAL_PASSWORD);
}
function isAdmin(req) {
  return tokenOk(req.query?.token || req.headers['x-admin-token'] || req.body?.token);
}

// Portal metadata — tells the frontend whether to show the lock screen.
app.get('/api/portal', (req, res) => {
  res.json({ ok: true, locked: PORTAL_LOCKED, name: config.BOT_NAME, version: config.BOT_VERSION });
});

// Validate the portal password (used by the lock screen).
app.post('/api/auth', (req, res) => {
  if (!PORTAL_LOCKED) return res.json({ ok: true, locked: false });
  res.json({ ok: tokenOk(req.body?.token), locked: true });
});

app.get('/api/sessions', (req, res) => {
  const all = bot.listSessions();
  if (!isAdmin(req)) {
    // Locked view: expose only the count, never the numbers/owners.
    return res.json({ ok: true, locked: true, count: all.length, sessions: [], max: config.MAX_SESSIONS });
  }
  res.json({ ok: true, locked: false, count: all.length, sessions: all, max: config.MAX_SESSIONS });
});

app.post('/api/session/remove', async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized — owner token required.' });
  try {
    const ok = await bot.removeSession(req.body?.number);
    res.json({ ok, removed: ok });
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || 'Remove fail.' });
  }
});

// Owner-only: produce a SESSION_ID backup string (base64 tar.gz of the session
// folder). Paste it into the SESSION_ID config var on an ephemeral-disk host
// so logins survive restarts.
app.get('/api/session-id', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized — owner token required.' });
  try {
    const base = path.resolve(config.SESSION_DIR);
    const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^[0-9]{8,15}$/.test(d)) : [];
    if (!dirs.length) return res.status(400).json({ ok: false, error: 'No linked sessions yet — pair a number first.' });
    const { execFileSync } = require('child_process');
    const buf = execFileSync('tar', ['-czf', '-', '-C', base, '.'], { maxBuffer: 64 * 1024 * 1024 });
    res.json({ ok: true, sessions: dirs.length, id: buf.toString('base64') });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ---- Settings persistence (owner-only) ------------------------------------
// Live toggles + whether a persistent remote store is configured. On hosts
// with an ephemeral disk the local file is wiped on
// restart, so `persistent:true` is what makes your toggles STICK.
app.get('/api/settings', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized \u2014 owner token required.' });
  const s = settings.status();
  const values = {};
  for (const k of settings.KEYS) values[k] = config[k];
  res.json({ ok: true, persistent: !!s.remote, file: s.file, remote: s.remote, schema: s.schema, dirty: s.dirty, values });
});

// Create a free, no-signup JSON store and return its URL. Paste the URL into
// the host env as SETTINGS_URL so every toggle survives restarts/redeploys.
app.post('/api/settings-store', async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized \u2014 owner token required.' });
  try {
    const url = await settings.createRemoteStore();
    res.json({ ok: true, url, hint: 'Add this as the SETTINGS_URL config var, then restart once.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Normalise a user-typed number the SAME way requestPair() does, so the session
// lookup never misses. "03001234567" -> "923001234567".
const normNum = (raw) => {
  try {
    const { normalizePhone } = require('./lib/helpers');
    return normalizePhone(raw, require('./config').DEFAULT_COUNTRY_CODE || '92').number;
  } catch { return String(raw || '').replace(/[^0-9]/g, ''); }
};

// How long a pairing code stays usable (WhatsApp gives roughly 2 minutes).
const CODE_TTL_MS = 120 * 1000;

app.post('/api/pair', async (req, res) => {
  try {
    const raw = String(req.body?.number || '');
    const code = await bot.requestPair(raw);
    const num = normNum(raw);
    // Return the QR in the SAME response. The old flow opened an SSE stream that
    // called requestPair() a second time -- which invalidated the code we just
    // showed and left the QR spinning forever behind a buffering proxy.
    const sess = bot.sessions.get(num);
    res.json({
      ok: true,
      code,
      number: num,
      qr: sess?.lastQr || null,
      status: sess?.status || 'pairing',
      expiresIn: Math.max(0, Math.round((CODE_TTL_MS - (Date.now() - (sess?.pairingSince || Date.now()))) / 1000)),
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || 'Pairing fail ho gaya.' });
  }
});

// Read-only pairing state. Safe to poll: it NEVER calls requestPair, so it can
// not invalidate the code the user is typing.
app.get('/api/pair/state', (req, res) => {
  const num = normNum(req.query?.number || '');
  if (!num) return res.status(400).json({ ok: false, error: 'number required' });
  const sess = bot.sessions.get(num);
  if (!sess) {
    return res.json({ ok: true, number: num, status: 'idle', code: null, qr: null, connected: false, error: null, expiresIn: 0 });
  }
  const age = sess.pairingSince ? Date.now() - sess.pairingSince : null;
  res.json({
    ok: true,
    number: num,
    status: sess.status || 'idle',
    code: sess.code || null,
    qr: sess.lastQr || null,
    connected: sess.status === 'connected',
    error: sess.lastError || null,
    age,
    expiresIn: age === null ? 0 : Math.max(0, Math.round((CODE_TTL_MS - age) / 1000)),
  });
});

// Force a completely clean pairing attempt for one number. Used by the portal's
// "Reset" button when WhatsApp rate-limits or a half-finished attempt is stuck.
app.post('/api/pair/reset', async (req, res) => {
  try {
    const num = normNum(req.body?.number || '');
    if (!num) return res.status(400).json({ ok: false, error: 'number required' });
    await bot.removeSession(num);
    res.json({ ok: true, number: num, message: 'Session reset ho gaya. Ab naya code lein.' });
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || 'Reset fail ho gaya.' });
  }
});

// SSE pairing stream — used by the pairing portal for live status
// (starting → code → linking → paired / error).
app.get('/api/pair/stream', async (req, res) => {
  const want = String(req.query?.number || req.body?.number || '').replace(/[^0-9]/g, '');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  let closed = false;
  let codeSentToClient = false;
  const send = (obj) => { if (!closed) { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* ignore */ } } };
  const cleanup = () => {
    if (closed) return;
    closed = true;
    bot.events.off('code', onCode);
    bot.events.off('qr', onQr);
    bot.events.off('linking', onLinking);
    bot.events.off('paired', onPaired);
    bot.events.off('error', onError);
    try { res.end(); } catch { /* ignore */ }
  };
  const mine = (num) => !want || !num || String(num) === want;
  // Raw QR string from Baileys — the portal turns it into a scannable image.
  // Sent alongside the pairing code so the user can EITHER scan OR type.
  const onQr = (e) => { if (!mine(e.number)) return; send({ status: 'qr', qr: e.qr, number: e.number }); };
  const onCode = (e) => { if (!mine(e.number)) return; codeSentToClient = true; send({ status: 'code', code: e.code, number: e.number }); };
  const onLinking = (e) => { if (!mine(e.number)) return; send({ status: 'linking', number: e.number, message: 'Code accepted — finishing the link...' }); };
  const onPaired = (e) => { if (!mine(e.number)) return; send({ status: 'paired', number: e.number }); setTimeout(cleanup, 1500); };
  const onError = (e) => { if (!mine(e.number)) return; send({ status: 'error', error: e.error, number: e.number }); cleanup(); };

  res.on('close', cleanup);
  bot.events.on('code', onCode);
  bot.events.on('qr', onQr);
  bot.events.on('linking', onLinking);
  bot.events.on('paired', onPaired);
  bot.events.on('error', onError);

  send({ status: 'starting', message: 'Connecting to WhatsApp...' });
  try {
    // NOTE: intentionally NO requestPair() here. The code is created once by
    // POST /api/pair; requesting it again would invalidate what the user was shown.
    const sess0 = bot.sessions.get(want);
    if (sess0?.code && !codeSentToClient) send({ status: 'code', code: sess0.code });
    // Replay the latest QR (it may have fired before this stream subscribed).
    const sess = bot.sessions.get(want);
    if (sess?.lastQr) send({ status: 'qr', qr: sess.lastQr, number: sess.number });
  } catch (e) {
    onError({ number: want, error: e?.message || 'Pairing fail ho gaya.' });
  }
});

// Render any text (usually a Baileys QR string) as a scannable SVG QR code.
// Server-side so the browser needs no QR library and nothing can break offline.
app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || req.query.data || '');
  if (!text) return res.status(400).json({ ok: false, error: 'text required' });
  if (text.length > 4096) return res.status(413).json({ ok: false, error: 'text too long' });
  try {
    const svg = await QRCode.toString(text, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: Math.min(720, Math.max(160, parseInt(req.query.size || '320', 10) || 320)),
      color: { dark: '#05060a', light: '#ffffff' },
    });
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(svg);
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'qr render failed' });
  }
});

app.get('/api/commands', (req, res) => {
  const cats = {};
  for (const p of plugins) {
    if (p.hidden) continue;
    cats[p.category || 'OTHER'] = cats[p.category || 'OTHER'] || [];
    cats[p.category || 'OTHER'].push(...p.commands);
  }
  res.json({ ok: true, prefix: config.PREFIX, total: totalCmds, categories: cats });
});

// ---- live diagnostics (no host-log access needed) ----
const debug = require('./lib/debug');
app.get('/api/debug', (req, res) => {
  const n = Math.min(200, parseInt(req.query.n || '80', 10) || 80);
  res.json({ ok: true, prefix: config.PREFIX, mode: config.MODE, owner: config.OWNER_NUMBER, events: debug.recent(n) });
});
app.post('/api/debug/clear', (req, res) => { debug.clear(); res.json({ ok: true }); });

// Force-reconnect every session (self-heal button for the portal / ops).
app.post('/api/reconnect', async (req, res) => {
  try { const n = await bot.reconnectAll(); res.json({ ok: true, restarted: n }); }
  catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

// Owner-only: send a REAL WhatsApp message from the bot to a number. This is
// the end-to-end proof that the live pipeline works (not a mock). Defaults to
// the owner number.
app.post('/api/test-send', async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Unauthorized — owner token required.' });
  const to = String(req.body?.number || config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
  const text = String(req.body?.text || `✅ *${config.BOT_NAME}* live test — bot kaam kar raha hy!\n💠 Prefix: ${config.PREFIX}\n🕒 ${new Date().toISOString()}`);
  if (!to) return res.status(400).json({ ok: false, error: 'number required' });
  try {
    const sock = bot.getSock();
    if (!sock) return res.status(503).json({ ok: false, error: 'no connected session' });
    const jid = `${to}@s.whatsapp.net`;
    const sent = await sock.sendMessage(jid, { text });
    res.json({ ok: true, to: jid, id: sent?.key?.id || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// In-process self-test: runs the real command engine (no WhatsApp needed).
app.get('/api/selftest', async (req, res) => {
  const results = [];
  const tests = ['.menu', '.ping', '.alive', '.help'];
  for (const t of tests) {
    const sent = [];
    const sock = {
      user: { id: '0@s.whatsapp.net' },
      sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'x' } }; },
      readMessages: async () => {}, sendPresenceUpdate: async () => {},
    };
    const m = { key: { remoteJid: '0@s.whatsapp.net', id: 'T' + Math.random().toString(36).slice(2, 9) }, message: { conversation: t }, pushName: 'SelfTest' };
    try {
      await require('./lib/handler').handleMessage(sock, m, { number: config.OWNER_NUMBER, ownerNumber: config.OWNER_NUMBER });
      await new Promise((r) => setTimeout(r, 300));
      results.push({ command: t, ok: sent.length > 0, replies: sent.length });
    } catch (e) { results.push({ command: t, ok: false, error: e?.message || String(e) }); }
  }
  res.json({ ok: results.every((r) => r.ok), results });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(config.PORT, () => {
  console.log(`${config.BOT_NAME} web portal: http://localhost:${config.PORT}`);
});

// ---------------------------------------------------------------------------
// Self-healing: give the error reporter a way to reach the owner on WhatsApp.
// It messages the owner ONLY when a command throws, deduped to one report per
// 10 minutes per distinct error, so it can never spam.
// ---------------------------------------------------------------------------
const selfheal = require('./lib/selfheal');
selfheal.setNotifier(async (text) => {
  const num = config.OWNER_NUMBER;
  if (!num) return;
  const sock = bot.getSock();
  if (!sock) return;
  await sock.sendMessage(`${num}@s.whatsapp.net`, { text });
});

// ---------------------------------------------------------------------------
// Start the bot (restores every saved session)
// ---------------------------------------------------------------------------
// On a host with an ephemeral disk the local settings file is
// wiped on restart, so if a remote store is configured we pull the persisted
// toggles from it BEFORE the bot starts handling messages. This is what makes
// "turn a setting ON" actually STICK across restarts/redeploys.
(async () => {
  try {
    // MongoDB is the source of truth across restarts on hosts with an ephemeral
    // disk. When MONGODB_URI is set we connect and pull
    // EVERY runtime store back BEFORE the bot starts handling messages.
    if (mongo.enabled()) {
      const ok = await mongo.init();
      console.log(`[MONGO] ${ok ? 'restored settings \u2705' : 'unreachable \u2014 using local files'}`);
      if (ok) {
        await Promise.all([
          settings.loadMongo().catch(() => {}),
          prefixes.loadMongo().catch(() => {}),
          reacts.loadMongo().catch(() => {}),
          reactSettings.loadMongo().catch(() => {}),
          userSettings.loadMongo().catch(() => {}),
          bans.loadMongo().catch(() => {}),
          apikeys.loadMongo().catch(() => {}),
        ]);
        console.log('[MONGO] settings, prefixes, reacts, react-settings, user-settings, bans + api-keys loaded');
      }
    } else if (settings.remoteEnabled()) {
      const ok = await settings.loadRemote();
      console.log(`[SETTINGS] remote store ${ok ? 'restored \u2705' : 'unreachable \u2014 using local file'}`);
    } else {
      console.log('[SETTINGS] no MONGODB_URI / SETTINGS_URL \u2014 toggles persist locally (set MONGODB_URI to persist across redeploys)');
    }
  } catch (e) {
    console.error('[SETTINGS] remote load error:', e?.message || e);
  }
  bot.startBot().catch((e) => console.error('bot start fail:', e?.message || e));
})();

// 24/7: ping ourselves so the host never idles the container out. Cheap (one
// localhost request a minute), no external traffic, no cost.
const SELF_PING_MS = Number(process.env.SELF_PING_MS || 60 * 1000);
if (SELF_PING_MS > 0) {
  const ping = setInterval(() => {
    const req = require('http').get({ host: '127.0.0.1', port: config.PORT, path: '/health' }, (r) => r.resume());
    req.on('error', () => {});
  }, SELF_PING_MS);
  if (ping.unref) ping.unref();
}

// SPEED: warm external connections in the background (DNS + TLS pre-connect)
require('./lib/helpers').warmupHosts().catch(() => {});
// SPEED: pre-generate the myth images in the background so the first user to
// type 💋earthquake / 💋dragonfire gets an instant cached image instead of
// waiting ~10s. Fully optional — failures are ignored, and WARM_IMAGES=0
// switches it off.
try { require('./scripts/warm-images'); } catch { /* ignore */ }

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e?.message || e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e?.message || e));
