/**
 * SAQIB MD — banned-user store
 * ---------------------------
 * Persisted next to the session dir (volume-backed on Railway) so bans
 * survive restarts / redeploys. Banned users are silently ignored by the
 * handler (except the owner).
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const mongo = require('./mongo');

const FILE = path.join(path.dirname(path.resolve(config.SESSION_DIR)), 'saqib-bans.json');

let list = [];
// O(1) membership: the handler checks `has()` on EVERY incoming message, so a
// linear `Array.includes` scan was pure overhead on the hot path.
const set = new Set();

const clean = (n) => String(n || '').replace(/[^0-9]/g, '');

function load() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) list = arr.map(clean).filter(Boolean);
  } catch { list = []; }
  set.clear();
  for (const n of list) set.add(n);
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
  } catch { /* ignore */ }
  mongo.setDoc('bans', 'global', list).catch(() => {});
}

/** Async: load the ban list from MongoDB (source of truth across restarts). */
async function loadMongo() {
  if (!mongo.isReady()) return false;
  try {
    const arr = await mongo.getDoc('bans', 'global');
    if (!Array.isArray(arr)) return false;
    list = arr.map(clean).filter(Boolean);
    set.clear();
    for (const n of list) set.add(n);
    try { fs.writeFileSync(FILE, JSON.stringify(list, null, 2)); } catch { /* ignore */ }
    return true;
  } catch (e) { console.error('[BAN] mongo load failed:', e?.message || e); return false; }
}

function has(n) { const c = clean(n); return !!c && set.has(c); }
function add(n) { const c = clean(n); if (c && !set.has(c)) { list.push(c); set.add(c); save(); } return c; }
function remove(n) { const c = clean(n); const before = list.length; list = list.filter((x) => x !== c); set.delete(c); if (list.length !== before) save(); return c; }
function all() { return [...list]; }

module.exports = { load, loadMongo, save, has, add, remove, all, FILE };
