/**
 * SAQIB MD — per-user prefixes
 * ----------------------------
 * Every user gets their OWN prefix. If two people are connected and one sets
 * `/`, nobody else's prefix changes — no cross-effect at all.
 *
 * Design:
 *   - The global `config.PREFIX` (owner's) is the DEFAULT for everyone.
 *   - A user's personal prefix lives in a JSON file on the volume, keyed by
 *     their phone number, so it survives restarts and redeploys.
 *   - Lookup order: user's own prefix → global default.
 *   - Only the user themselves can change their prefix (identified by the
 *     sender number), so one user can never alter another's.
 *
 * Stored next to the session dir (the mounted /data volume) exactly like
 * lib/settings.js does, so it persists.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const mongo = require('./mongo');

const FILE = path.join(path.dirname(path.resolve(config.SESSION_DIR)), 'saqib-prefixes.json');

/** number -> prefix */
let MAP = {};

function load() {
  try {
    const obj = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (obj && typeof obj === 'object') MAP = obj;
    console.log(`[PREFIX] loaded ${Object.keys(MAP).length} personal prefixes`);
  } catch { /* first run */ }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(MAP, null, 2));
  } catch (e) {
    console.error('[PREFIX] save fail:', e?.message || e);
  }
  mongo.setDoc('prefixes', 'global', MAP).catch(() => {});
}

/** Async: load personal prefixes from MongoDB (source of truth across restarts). */
async function loadMongo() {
  if (!mongo.isReady()) return false;
  try {
    const obj = await mongo.getDoc('prefixes', 'global');
    if (!obj || typeof obj !== 'object') return false;
    MAP = obj;
    try { fs.writeFileSync(FILE, JSON.stringify(MAP, null, 2)); } catch { /* ignore */ }
    return true;
  } catch (e) { console.error('[PREFIX] mongo load failed:', e?.message || e); return false; }
}

/** The prefix a given user should use (their own, else the global default). */
function forUser(number) {
  const n = String(number || '').replace(/[^0-9]/g, '');
  if (n && MAP[n]) return MAP[n];
  return config.PREFIX;
}

/** Set a user's personal prefix. Pass null/'' to reset to the global default. */
function set(number, prefix) {
  const n = String(number || '').replace(/[^0-9]/g, '');
  if (!n) return false;
  if (!prefix) { delete MAP[n]; save(); return true; }
  MAP[n] = String(prefix);
  save();
  return true;
}

/** True when this user has their own prefix (not the global default). */
function has(number) {
  const n = String(number || '').replace(/[^0-9]/g, '');
  return !!(n && MAP[n]);
}

/** Everyone who has a personal prefix (owner diagnostics). */
function all() { return { ...MAP }; }

module.exports = { load, loadMongo, save, forUser, set, has, all, FILE };
