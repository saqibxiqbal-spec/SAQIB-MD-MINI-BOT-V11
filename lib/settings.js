/**
 * SAQIB MD — persistent runtime settings
 * --------------------------------------
 * Toggle commands (.autoreact, .antidelete, .statuslike, …) change `config`
 * live. A plain `.env` write does NOT survive a redeploy, so we persist the
 * overrides to a JSON file placed NEXT TO the session dir — which lives on the
 * mounted volume (/data) on Railway/Render/Koyeb — so every toggle survives
 * restarts and redeploys.
 *
 * TWO problems this file fixes:
 *
 *  1) "I turn a setting ON but it goes back OFF."
 *     The old loader treated ANY value present in the environment as
 *     authoritative, so if a toggle was also listed in `.env` (e.g.
 *     AUTO_REACT=false) the persisted ON value was thrown away on every boot.
 *     We now track which keys the user actually CHANGED at runtime (the
 *     `_dirty` list). A dirty key ALWAYS wins from the saved file; only keys
 *     the user never touched fall back to the env value. So toggles STICK.
 *
 *  2) "The host has no volume — the file is wiped on every restart."
 *     If SETTINGS_URL is set, the settings are ALSO stored in a remote JSON
 *     blob (GET on boot, PUT on every save). Any service that supports plain
 *     GET/PUT of a JSON body works (see scripts/make-settings-store.js).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const config = require('../config');
const mongo = require('./mongo');

// /data/session  ->  /data/saqib-settings.json   (volume-backed)
const FILE = path.join(path.dirname(path.resolve(config.SESSION_DIR)), 'saqib-settings.json');

// Bump this whenever the DEFAULT set changes in a way that should reset the
// persisted overrides ONCE. (Schema 3 introduced dirty-tracking; schema 4 moved
// the react toggles OUT of the shared store into the PER-SESSION store
// (lib/reactSettings.js) and LOCKED the owner reaction.)
const SCHEMA = 4;

// Keys that may be overridden at runtime (and persisted).
const KEYS = [
  'MODE', 'PREFIX', 'BOT_NAME', 'OWNER_NAME', 'OWNER_NUMBER',
  'AUTO_READ', 'AUTO_TYPING', 'WELCOME', 'GOODBYE',
  // NOTE: AUTO_REACT / AUTO_REACT_GROUP / AUTO_REACT_CHAT / REACT_SCOPE are
  // intentionally NOT here — they are PER-SESSION (lib/reactSettings.js).
  // OWNER_REACT_EMOJI / OWNER_REACT_ALWAYS are intentionally NOT here — they
  // are LOCKED constants (config.js) that no command may change.
  'ANTILINK', 'ANTIDELETE', 'ANTIDELETE_INBOX', 'ANTIDELETE_TO_CHAT', 'ANTICALL_MSG', 'ANTIEDIT', 'ANTISPAM', 'ANTICALL',
  'AUTOSTATUS', 'AUTOSAVESTATUS', 'AUTOVIEWONCE', 'AUTOBIO', 'CHATBOT', 'AUTOREAD_STATUS',
  'ONLINE', 'SUDO', 'RECORDING', 'STATUSVIEW', 'STATUSLIKE', 'ADMINISTRATION', 'MENTION_REPLY',
  'WELCOME_MSG', 'GOODBYE_MSG', 'STATUS_EMOJI', 'DESCRIPTION', 'STICKER_NAME',
  'PRIVACY', 'GROUP_PRIVACY', 'BOT_PIC',
];

/**
 * Snapshot of the boot-time (env) defaults, captured BEFORE load() applies any
 * persisted overrides. Powers `.reset` AND the dirty-tracking (a key whose live
 * value differs from its boot default was changed at runtime).
 */
const DEFAULTS = {};
for (const k of KEYS) DEFAULTS[k] = config[k];

/** Is a key EXPLICITLY set in the environment (Railway / host / .env)? */
function envSet(key) {
  const v = process.env[key];
  return v !== undefined && String(v) !== '';
}

/** Keys whose live value differs from the boot default => changed at runtime. */
function dirtyKeys() {
  const out = [];
  for (const k of KEYS) {
    try {
      if (JSON.stringify(config[k]) !== JSON.stringify(DEFAULTS[k])) out.push(k);
    } catch { /* ignore */ }
  }
  return out;
}

/* ----------------------------- remote store ----------------------------- */
// Any endpoint that supports GET + PUT of a JSON body. e.g. a restful-api.dev
// object URL, a private server, a gist proxy… (see scripts/make-settings-store.js)
const REMOTE_URL = String(process.env.SETTINGS_URL || '').trim();
const REMOTE_HEADERS = { 'Content-Type': 'application/json' };
if (process.env.SETTINGS_TOKEN) REMOTE_HEADERS.Authorization = `Bearer ${process.env.SETTINGS_TOKEN}`;
// restful-api.dev (the zero-signup store the portal can create for you) wraps
// the payload in a `data` field; every other endpoint is treated as raw JSON.
const REMOTE_WRAPS = /restful-api\.dev/i.test(REMOTE_URL);

function remoteEnabled() { return !!REMOTE_URL; }

/**
 * Some zero-signup JSON stores (api.restful-api.dev) reject payloads with too
 * many fields / too many bytes (HTTP 500 once the object gets big). To stay
 * safely under that limit we pack the whole settings object into ONE gzipped,
 * base64 field. Tiny (~300 bytes), and loss-free.
 */
function packObj(obj) {
  return { _packed: 1, z: zlib.gzipSync(Buffer.from(JSON.stringify(obj))).toString('base64') };
}
function unpackObj(data) {
  if (data && data._packed && typeof data.z === 'string') {
    try { return JSON.parse(zlib.gunzipSync(Buffer.from(data.z, 'base64')).toString('utf8')); }
    catch { return null; }
  }
  return data; // plain (non-wrapping) endpoint
}

/** Create a fresh remote JSON store on a free, no-signup service. */
async function createRemoteStore() {
  const body = { _schema: SCHEMA, _dirty: dirtyKeys() };
  for (const k of KEYS) body[k] = config[k];
  const r = await fetch('https://api.restful-api.dev/objects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `saqib-md-settings-${config.OWNER_NUMBER || 'bot'}`, data: packObj(body) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error('store create HTTP ' + r.status);
  const j = await r.json();
  if (!j || !j.id) throw new Error('store create: no id returned');
  return `https://api.restful-api.dev/objects/${j.id}`;
}

/** Apply a settings object (from file or remote) into the live config. */
function apply(obj, source) {
  if (!obj || typeof obj !== 'object') return;
  // Schema migration: an older file predates the current default set, so we
  // discard its overrides (fresh config.js defaults win) and re-save.
  if (obj._schema !== SCHEMA) {
    console.log(`[SETTINGS] schema ${obj._schema || 'legacy'} -> ${SCHEMA}: resetting to defaults`);
    save();
    return;
  }
  const dirty = Array.isArray(obj._dirty) ? obj._dirty : null;
  let applied = 0, skipped = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (!KEYS.includes(k)) continue;
    // A key the user changed at runtime (dirty) ALWAYS wins from the store, so
    // toggles stick. Only untouched keys defer to an explicit env value.
    const userChanged = !dirty || dirty.includes(k);
    if (envSet(k) && !userChanged) { skipped++; continue; }
    config[k] = v; applied++;
  }
  console.log(`[SETTINGS] loaded ${applied} overrides (${skipped} skipped — env wins) from ${source}`);
}

/** Load persisted overrides into the live config (called once at boot). */
function load() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    apply(JSON.parse(raw), FILE);
  } catch { /* first run — nothing to load */ }
}

/**
 * Async: when a remote store is configured, load from it (it is the source of
 * truth across restarts on hosts with no volume, with an ephemeral disk). Falls back to
 * the local file silently when the remote is unreachable.
 */
async function loadRemote() {
  if (!remoteEnabled()) return false;
  try {
    const r = await fetch(REMOTE_URL, { headers: REMOTE_HEADERS, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return false;
    const raw = await r.json();
    const obj = (REMOTE_WRAPS && raw && raw.data) ? unpackObj(raw.data) : raw;
    if (!obj) return false;
    apply(obj, REMOTE_URL);
    // cache it locally too
    try { fs.writeFileSync(FILE, JSON.stringify(obj, null, 2)); } catch { /* ignore */ }
    return true;
  } catch (e) {
    console.error('[SETTINGS] remote load failed:', e?.message || e);
    return false;
  }
}

let _pushTimer = null;
function pushRemote(obj) {
  if (!remoteEnabled()) return;
  clearTimeout(_pushTimer);
  // Debounce so a burst of toggles makes one request.
  _pushTimer = setTimeout(() => {
    const body = REMOTE_WRAPS
      ? JSON.stringify({ name: `saqib-md-settings-${config.OWNER_NUMBER || 'bot'}`, data: packObj(obj) })
      : JSON.stringify(obj);
    fetch(REMOTE_URL, { method: 'PUT', headers: REMOTE_HEADERS, body, signal: AbortSignal.timeout(15000) })
      .then((r) => { if (!r.ok) console.error('[SETTINGS] remote save HTTP', r.status); })
      .catch((e) => console.error('[SETTINGS] remote save failed:', e?.message || e));
  }, 800);
  if (_pushTimer.unref) _pushTimer.unref();
}

/**
 * Async: when MongoDB is configured, load the settings doc from it (it is the
 * source of truth across restarts on hosts with no volume, with an ephemeral disk). The
 * local file is refreshed as a cache. Silently no-ops when Mongo is off.
 */
async function loadMongo() {
  if (!mongo.isReady()) return false;
  try {
    const obj = await mongo.getDoc('settings', 'global');
    if (!obj || typeof obj !== 'object') return false;
    apply(obj, 'mongodb');
    try { fs.writeFileSync(FILE, JSON.stringify(obj, null, 2)); } catch { /* ignore */ }
    return true;
  } catch (e) {
    console.error('[SETTINGS] mongo load failed:', e?.message || e);
    return false;
  }
}

/** Persist the current values of all overridable keys. */
function save() {
  const obj = { _schema: SCHEMA, _dirty: dirtyKeys() };
  for (const k of KEYS) obj[k] = config[k];
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('[SETTINGS] save fail:', e?.message || e);
  }
  pushRemote(obj);
  // Mirror to MongoDB (fire-and-forget) so settings survive restarts on hosts
  // with an ephemeral disk.
  mongo.setDoc('settings', 'global', obj).catch(() => {});
}

/** Reset one key (or all when key is omitted) back to its boot default. */
function reset(key) {
  if (key) {
    if (!KEYS.includes(key)) return false;
    config[key] = DEFAULTS[key];
  } else {
    for (const k of KEYS) config[k] = DEFAULTS[k];
  }
  save();
  return true;
}

/** Small status object for the portal / diagnostics. */
function status() {
  return {
    file: FILE,
    remote: remoteEnabled() ? REMOTE_URL : null,
    schema: SCHEMA,
    dirty: dirtyKeys(),
  };
}

module.exports = { load, loadRemote, loadMongo, save, reset, status, createRemoteStore, FILE, KEYS, DEFAULTS, SCHEMA, remoteEnabled };
