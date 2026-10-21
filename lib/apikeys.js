/**
 * SAQIB MD — DATABASE-DRIVEN API KEYS
 * -----------------------------------
 * Media downloaders (TikTok / Facebook / Instagram / …) sometimes need an API
 * key or a custom endpoint. Hard-coding them in `.env` means every change needs
 * a redeploy, and on a host with an ephemeral disk a `.env` edit is
 * the ONLY way — which is slow and error-prone.
 *
 * This module makes the keys DATABASE-DRIVEN:
 *   - They live in MongoDB (collection `api_keys`, one `global` document) which
 *     is the source of truth across restarts.
 *   - A local JSON file (`saqib-apikeys.json`, next to the session dir / on the
 *     mounted volume) is kept as a fast cache + offline fallback.
 *   - An owner can list every key (`.apikeys`) and update ONE key live
 *     (`.setapikey <service> <key>`) with NO server restart.
 *
 * Schema (per service):
 *   {
 *     key:      '<api key / token>',   // the secret
 *     endpoint: 'https://…',           // optional custom API base (downloaders)
 *     updatedAt:'<ISO timestamp>'
 *   }
 *
 * Everything is optional + fail-safe: with no MONGODB_URI the bot still works
 * exactly as before (local file only), and a missing key simply means the
 * downloader falls back to its keyless default path.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const mongo = require('./mongo');

// /data/session -> /data/saqib-apikeys.json  (volume-backed, like the others)
const FILE = path.join(path.dirname(path.resolve(config.SESSION_DIR)), 'saqib-apikeys.json');

// Services we know about out of the box (the admin can still set any name).
const SERVICES = [
  { id: 'tiktok', label: 'Tiktok', emoji: '🎵' },
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'song', label: 'Song', emoji: '🎧' },
  { id: 'video', label: 'Video', emoji: '🎬' },
  { id: 'facebook', label: 'Facebook', emoji: '📘' },
  { id: 'youtube', label: 'YouTube', emoji: '▶️' },
  { id: 'twitter', label: 'Twitter/X', emoji: '🐦' },
  { id: 'spotify', label: 'Spotify', emoji: '🟢' },
];

// The interactive `.apikey` menu (numbered). Order matters — the number the
// owner replies with maps to this list. 1 Tiktok, 2 Instagram, 3 Song, 4 Video.
const MENU = [
  { n: 1, id: 'tiktok', label: 'Tiktok', emoji: '🎵' },
  { n: 2, id: 'instagram', label: 'Instagram', emoji: '📸' },
  { n: 3, id: 'song', label: 'Song', emoji: '🎧' },
  { n: 4, id: 'video', label: 'Video', emoji: '🎬' },
];

const SERVICE_IDS = SERVICES.map((s) => s.id);
const isKnown = (s) => SERVICE_IDS.includes(String(s || '').toLowerCase());
const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

/** service -> { key, endpoint, updatedAt } */
let store = {};

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (raw && typeof raw === 'object') store = raw;
    }
  } catch { store = {}; }
  return store;
}

function save() {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (e) { console.error('[APIKEYS] save fail:', e?.message || e); }
  // Mirror to MongoDB (fire-and-forget) — the source of truth across restarts.
  mongo.setDoc('api_keys', 'global', store).catch(() => {});
  return true;
}

/** Async: load the API-key store from MongoDB (source of truth). */
async function loadMongo() {
  if (!mongo.isReady()) return false;
  try {
    const obj = await mongo.getDoc('api_keys', 'global');
    if (!obj || typeof obj !== 'object') return false;
    store = obj;
    try { fs.writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch { /* ignore */ }
    return true;
  } catch (e) { console.error('[APIKEYS] mongo load failed:', e?.message || e); return false; }
}

/** The key string for a service ('' when unset). */
function get(service) {
  const s = norm(service);
  const rec = store[s];
  if (!rec) return '';
  return typeof rec === 'string' ? rec : String(rec.key || '');
}

/** The full record for a service: { key, endpoint, updatedAt } (or null). */
function getService(service) {
  const s = norm(service);
  const rec = store[s];
  if (!rec) return null;
  if (typeof rec === 'string') return { key: rec, endpoint: '', updatedAt: null };
  return { key: String(rec.key || ''), endpoint: String(rec.endpoint || ''), updatedAt: rec.updatedAt || null };
}

/**
 * Set / update ONE service's key (and optional endpoint). Live — no restart.
 * Passing an empty key removes the entry.
 */
function set(service, key, endpoint) {
  const s = norm(service);
  if (!s) return false;
  const k = String(key == null ? '' : key).trim();
  if (!k) { delete store[s]; return save(); }
  const prev = getService(s) || {};
  const ep = endpoint == null ? (prev.endpoint || '') : String(endpoint).trim();
  store[s] = { key: k, endpoint: ep, updatedAt: new Date().toISOString() };
  return save();
}

/** Remove a service entirely. */
function remove(service) {
  const s = norm(service);
  if (!s) return false;
  delete store[s];
  return save();
}

/** Display metadata (label/emoji) for a service id. */
function getServiceMeta(id) {
  const s = norm(id);
  return SERVICES.find((x) => x.id === s) || { id: s, label: s || 'service', emoji: '🔑' };
}

/** True when a service has a non-empty key. */
function has(service) { return !!get(service); }

/** Everything (diagnostics / portal). */
function all() { return { ...store }; }

/** A tidy list for the admin `.apikeys` command. */
function list() {
  const ids = new Set([...SERVICE_IDS, ...Object.keys(store)]);
  return [...ids].map((id) => {
    const meta = SERVICES.find((s) => s.id === id) || { id, label: id, emoji: '🔑' };
    const rec = getService(id);
    return {
      id,
      label: meta.label,
      emoji: meta.emoji,
      known: isKnown(id),
      configured: !!(rec && rec.key),
      key: rec ? rec.key : '',
      endpoint: rec ? rec.endpoint : '',
      updatedAt: rec ? rec.updatedAt : null,
    };
  });
}

/** Mask a secret for safe display: keep the first 4 + last 4 characters. */
function mask(key) {
  const k = String(key || '');
  if (!k) return '(not set)';
  if (k.length <= 8) return k[0] + '•'.repeat(Math.max(1, k.length - 2)) + k[k.length - 1];
  return `${k.slice(0, 4)}${'•'.repeat(Math.min(16, k.length - 8))}${k.slice(-4)}`;
}

module.exports = {
  load, loadMongo, save,
  get, getService, getServiceMeta, set, remove, has, all, list, mask,
  SERVICES, SERVICE_IDS, MENU, isKnown, FILE,
};
