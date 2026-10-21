/**
 * SAQIB MD — per-user auto-react emojis
 * -------------------------------------
 * Every user picks their own emoji set for auto-react. Same shape and storage
 * pattern as lib/prefixes.js: a plain JSON file on the /data volume, keyed by
 * the bare phone number, so one user's choice never touches another's.
 *
 *   .setreact 🔥 ❤️ 🎉   -> use exactly these emojis
 *   .setreact reset      -> back to the bot default
 *   .setreact            -> show what you have now
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const mongo = require('./mongo');

// Sit next to saqib-settings.json, which lives on the mounted /data volume.
const FILE = path.join(path.dirname(config.SESSION_DIR), 'saqib-reacts.json');

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
  } catch { /* ignore */ }
  mongo.setDoc('reacts', 'global', store).catch(() => {});
  return true;
}

/** Async: load per-user react emojis from MongoDB (source of truth). */
async function loadMongo() {
  if (!mongo.isReady()) return false;
  try {
    const obj = await mongo.getDoc('reacts', 'global');
    if (!obj || typeof obj !== 'object') return false;
    store = obj;
    try { fs.writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch { /* ignore */ }
    return true;
  } catch (e) { console.error('[REACT] mongo load failed:', e?.message || e); return false; }
}

const key = (num) => String(num || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

/** The emoji list to use for this number, or the bot default. */
function forUser(num, fallback) {
  const k = key(num);
  const mine = k && Array.isArray(store[k]) ? store[k].filter(Boolean) : null;
  if (mine && mine.length) return mine;
  return Array.isArray(fallback) && fallback.length ? fallback : ['🔥'];
}

function set(num, emojis) {
  const k = key(num);
  if (!k) return false;
  const list = (Array.isArray(emojis) ? emojis : [])
    .map((e) => String(e).trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!list.length) return false;
  store[k] = list;
  return save();
}

function reset(num) {
  const k = key(num);
  if (!k) return false;
  delete store[k];
  return save();
}

function has(num) {
  const k = key(num);
  return !!(k && Array.isArray(store[k]) && store[k].length);
}

function all() {
  return { ...store };
}

module.exports = { load, loadMongo, save, forUser, set, reset, has, all, FILE };
