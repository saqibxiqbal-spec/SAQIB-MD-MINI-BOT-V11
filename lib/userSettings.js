/**
 * SAQIB MD — PER-NUMBER (per-bot) settings store
 * ----------------------------------------------
 * WHY THIS EXISTS
 * ---------------
 * Before this file, every toggle command (`.antilink`, `.antispam`,
 * `.antidelete`, `.statuslike`, …) wrote straight into the single shared
 * `config` object. That meant:
 *
 *   1) ONE user turning a feature ON changed it for EVERY linked number.
 *   2) Settings were global, so "meri settings" did not really exist.
 *
 * `.autoreact` was already fixed this way (see lib/reactSettings.js). This file
 * does the same thing for the REST of the toggles, keyed by the bot's OWN
 * number (the number that linked the session).
 *
 * HOW IT WORKS
 * ------------
 *   - `store`  = { "<botNumber>": { ANTILINK: true, ANTISPAM: false, … } }
 *   - `eff(n)` = a Proxy that answers `eff.ANTILINK` with the per-number value
 *                when one was set, otherwise falls back to the global `config`
 *                value. So every existing `config.X` read keeps working, and
 *                the moment a number overrides X it gets its OWN value.
 *   - Persisted to `saqib-user-settings.json` NEXT TO the session dir (volume
 *     backed on Railway/Render/Koyeb) AND mirrored to MongoDB when available.
 *   - `exportCode()` / `importCode()` give the owner a portable backup string,
 *     so settings can be restored even on a host with a wiped disk and no DB.
 *
 * Nothing here can ever touch another number's settings.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const config = require('../config');
const mongo = require('./mongo');

// /data/session -> /data/saqib-user-settings.json   (volume-backed)
const FILE = path.join(path.dirname(path.resolve(config.SESSION_DIR)), 'saqib-user-settings.json');

/**
 * Keys that may be overridden PER NUMBER.
 * Deliberately excluded:
 *   - AUTO_REACT*      -> owned by lib/reactSettings.js (already per-number)
 *   - PREFIX           -> owned by lib/prefixes.js   (already per-number)
 *   - MODE / BOT_NAME  -> truly global, owner-only identity
 *   - OWNER_REACT_*    -> LOCKED constants, no command may change them
 */
const KEYS = Object.freeze([
  'ANTILINK', 'ANTISPAM', 'ANTIDELETE', 'ANTIDELETE_INBOX', 'ANTIDELETE_TO_CHAT',
  'ANTIEDIT', 'ANTICALL', 'ANTICALL_MSG', 'ANTIVIEWONCE',
  'AUTOVIEWONCE', 'AUTOSTATUS', 'AUTOSAVESTATUS', 'AUTOREAD_STATUS',
  'STATUSLIKE', 'STATUSVIEW', 'CHATBOT', 'AUTOBIO', 'ONLINE',
  'WELCOME', 'GOODBYE', 'AUTO_READ', 'AUTO_TYPING', 'RECORDING',
  'MENTION_REPLY', 'ADMINISTRATION',
]);

let store = {};
let loaded = false;

function keyOf(sessionNumber) {
  const n = String(sessionNumber || config.OWNER_NUMBER || 'default').replace(/[^0-9]/g, '');
  return n || 'default';
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) store = raw;
  } catch { /* first run — nothing saved yet */ }
  loaded = true;
  return store;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('[USERSET] save fail:', e?.message || e);
  }
  // Mirror to MongoDB (fire-and-forget) so per-number choices survive restarts
  // on hosts whose disk is wiped on redeploy.
  try { mongo.setDoc('user_settings', 'global', store).catch(() => {}); } catch { /* ignore */ }
}

async function loadMongo() {
  if (!mongo.isReady()) return false;
  try {
    const obj = await mongo.getDoc('user_settings', 'global');
    if (!obj || typeof obj !== 'object') return false;
    // Mongo wins only for numbers it actually knows about; local-only numbers
    // (e.g. added while the DB was down) are preserved.
    store = { ...store, ...obj };
    loaded = true;
    try { fs.writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch { /* ignore */ }
    return true;
  } catch (e) {
    console.error('[USERSET] mongo load failed:', e?.message || e);
    return false;
  }
}

/** The raw override object for ONE number (may be empty). */
function get(sessionNumber) {
  if (!loaded) load();
  const cur = store[keyOf(sessionNumber)];
  return (cur && typeof cur === 'object') ? { ...cur } : {};
}

/**
 * Effective settings for ONE number: per-number override first, global config
 * second. Safe to read any config key through it.
 */
function eff(sessionNumber) {
  const num = keyOf(sessionNumber);
  return new Proxy({}, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (!loaded) load();
      const own = store[num];
      if (own && Object.prototype.hasOwnProperty.call(own, prop)) return own[prop];
      return config[prop];
    },
    has(_t, prop) {
      if (typeof prop !== 'string') return false;
      if (!loaded) load();
      const own = store[num];
      return !!(own && Object.prototype.hasOwnProperty.call(own, prop)) || prop in config;
    },
  });
}

/** Patch ONE number's settings. Never touches any other number. */
function set(sessionNumber, patch) {
  if (!loaded) load();
  const k = keyOf(sessionNumber);
  const next = { ...(store[k] || {}) };
  for (const [key, val] of Object.entries(patch || {})) {
    if (!KEYS.includes(key)) continue;          // ignore anything not per-number
    next[key] = val;
  }
  store[k] = next;
  save();
  return { ...next };
}

/** Drop ONE number's overrides (back to global defaults). */
function clear(sessionNumber) {
  if (!loaded) load();
  const k = keyOf(sessionNumber);
  if (store[k]) { delete store[k]; save(); return true; }
  return false;
}

/** Everything (diagnostics / portal). */
function all() { if (!loaded) load(); return store; }

/* --------------------------- portable backup --------------------------- */
/**
 * Export one number's settings as a short, copy-pasteable code.
 * Format: SMD1.<base64url(gzip(json))>
 * The user can paste this back with `.restore <code>` after a restart, a
 * redeploy, or on a brand-new host — no database required.
 */
function exportCode(sessionNumber) {
  if (!loaded) load();
  const k = keyOf(sessionNumber);
  const payload = { n: k, s: store[k] || {}, t: Date.now() };
  const packed = zlib.gzipSync(Buffer.from(JSON.stringify(payload))).toString('base64');
  return 'SMD1.' + packed.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Import a code produced by exportCode().
 * Returns { number, count } on success. Throws a readable error on bad input.
 */
function importCode(code, fallbackNumber) {
  if (!loaded) load();
  const raw = String(code || '').trim();
  if (!raw.startsWith('SMD1.')) throw new Error('Ye valid backup code nahi hy (SMD1. se shuru hota hy).');
  const b64 = raw.slice(5).replace(/-/g, '+').replace(/_/g, '/');
  let obj;
  try {
    obj = JSON.parse(zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'));
  } catch {
    throw new Error('Backup code kharab hy — poora code copy karein (beech mein space na ho).');
  }
  if (!obj || typeof obj !== 'object' || typeof obj.s !== 'object') {
    throw new Error('Backup code ke andar settings nahi mili.');
  }
  const k = keyOf(obj.n || fallbackNumber);
  const clean = {};
  for (const [key, val] of Object.entries(obj.s)) {
    if (KEYS.includes(key)) clean[key] = val;
  }
  store[k] = { ...(store[k] || {}), ...clean };
  save();
  return { number: k, count: Object.keys(clean).length };
}

/** Small status object for diagnostics. */
function status() {
  if (!loaded) load();
  return { file: FILE, numbers: Object.keys(store).length, keys: KEYS.length };
}

module.exports = {
  load, loadMongo, save, get, eff, set, clear, all,
  exportCode, importCode, status,
  FILE, KEYS,
};
