/**
 * SAQIB MD — PER-SESSION react settings
 * ------------------------------------
 * `.autoreact` / `.userreact` are PER-BOT: every linked number keeps its OWN
 * react choice, so one user turning react on/off NEVER changes anybody else's
 * bot. This is the fix for the "sabke off ho jaate hain" bug — previously the
 * toggles mutated the single shared `config` object (and were persisted to one
 * shared file + remote blob), so one change propagated to every bot.
 *
 * Settings live in `saqib-react-settings.json` (next to the session dir), keyed
 * by the bot's OWN number (the number that linked the session).
 *
 * The OWNER reaction (🧑‍💻) is deliberately NOT here — it is LOCKED and always on
 * for every bot (see config.OWNER_REACT_ALWAYS / config.OWNER_REACT_EMOJI), so
 * no command and no stored value can ever turn it off or change it.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const mongo = require('./mongo');

// /data/session -> /data/saqib-react-settings.json  (volume-backed)
const FILE = path.join(path.dirname(path.resolve(config.SESSION_DIR)), 'saqib-react-settings.json');

// Boot defaults for a brand-new bot. Kept in sync with config.js on purpose so
// the very first `.autoreact` behaves exactly like before, but PER BOT.
const DEFAULTS = Object.freeze({
  autoReact: false,      // master: react to NORMAL USERS at all?
  autoReactGroup: true,  // apply in groups?
  autoReactChat: true,   // apply in DMs?
  reactScope: 'all',     // 'all' | 'user'  (owner is ALWAYS reacted regardless)
  mirrorEmoji: config.MIRROR_EMOJI !== false, // MIRROR: same emoji the user sent
});

let store = {};
let loaded = false;

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (raw && typeof raw === 'object') store = raw;
  } catch { /* first run — nothing to load */ }
  loaded = true;
  return store;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (e) { console.error('[REACTSET] save fail:', e?.message || e); }
  // Mirror to MongoDB (fire-and-forget) so per-bot react choices survive
  // restarts on hosts with an ephemeral disk.
  mongo.setDoc('react_settings', 'global', store).catch(() => {});
}

/** Async: load the per-bot react store from MongoDB (source of truth). */
async function loadMongo() {
  if (!mongo.isReady()) return false;
  try {
    const obj = await mongo.getDoc('react_settings', 'global');
    if (!obj || typeof obj !== 'object') return false;
    store = obj;
    loaded = true;
    try { fs.writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch { /* ignore */ }
    return true;
  } catch (e) {
    console.error('[REACTSET] mongo load failed:', e?.message || e);
    return false;
  }
}

/** Normalise a session number to a bare-digit key (fallback: the owner number). */
function keyOf(sessionNumber) {
  const n = String(sessionNumber || config.OWNER_NUMBER || 'default').replace(/[^0-9]/g, '');
  return n || 'default';
}

/** The react settings for ONE bot (session). Always returns a full object. */
function get(sessionNumber) {
  if (!loaded) load();
  const cur = store[keyOf(sessionNumber)] || {};
  return { ...DEFAULTS, ...cur };
}

/** Patch ONE bot's react settings (never touches any other bot). */
function set(sessionNumber, patch) {
  if (!loaded) load();
  const k = keyOf(sessionNumber);
  store[k] = { ...DEFAULTS, ...(store[k] || {}), ...(patch || {}) };
  save();
  return store[k];
}

/** Everything (diagnostics / portal). */
function all() { if (!loaded) load(); return store; }

module.exports = { load, loadMongo, save, get, set, all, DEFAULTS, FILE };
