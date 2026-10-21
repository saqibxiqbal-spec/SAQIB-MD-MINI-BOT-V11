/**
 * SAQIB MD — SESSION PERSISTENCE (MongoDB-backed auth state)
 * ----------------------------------------------------------
 * THE PROBLEM
 *   Baileys keeps each linked number's WhatsApp credentials in files under
 *   SESSION_DIR/<number>/ (creds.json + app-state-sync-*.json + pre-keys …).
 *   On most hosts the container disk is EPHEMERAL: every restart
 *   restart / redeploy wipes those files, so every user is forced to RE-PAIR.
 *
 * THE FIX
 *   Mirror every session folder into MongoDB (collection `sessions`, one
 *   document per number) and rebuild the folders on boot BEFORE the disk scan.
 *   Now a container restart reconnects every linked number automatically — no
 *   re-pairing.
 *
 * DESIGN
 *   - One document per session: { _id: '<number>', data: { files, savedAt } }
 *     where `files` is a plain { '<filename>': '<file contents>' } map (exactly
 *     the bytes Baileys wrote), so restore is a straight file write.
 *   - Writes are DEBOUNCED (creds.update fires a lot) and fire-and-forget, so
 *     the hot path (message handling) is never blocked.
 *   - Restore NEVER clobbers a live, already-registered session on disk — it
 *     only fills in what the ephemeral disk lost.
 *   - Fail-safe: with no MONGODB_URI (or Mongo down) everything degrades to the
 *     old disk-only behaviour. Nothing throws.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const mongo = require('./mongo');

const COLLECTION = 'sessions';
const DEBOUNCE_MS = 1500;

// number -> timeout handle (pending debounced mirror)
const pending = new Map();

function sessionDir(number) {
  return path.join(path.resolve(config.SESSION_DIR), String(number));
}

function clean(number) {
  return String(number || '').replace(/[^0-9]/g, '');
}

/** Only auth-state files (Baileys writes *.json); skip temp/lock files. */
function isAuthFile(name) {
  return typeof name === 'string' && name.endsWith('.json') && !name.startsWith('.');
}

/** Read a session folder into a { filename: contents } map. */
function readDir(dir) {
  const files = {};
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!isAuthFile(f)) continue;
      const p = path.join(dir, f);
      try { if (fs.statSync(p).isFile()) files[f] = fs.readFileSync(p, 'utf8'); } catch { /* skip */ }
    }
  } catch { /* no folder yet */ }
  return files;
}

/** Write a { filename: contents } map into a session folder. Returns count. */
function writeDir(dir, files) {
  let n = 0;
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  for (const [f, content] of Object.entries(files || {})) {
    if (!isAuthFile(f)) continue; // never write anything but auth JSON
    try { fs.writeFileSync(path.join(dir, f), String(content)); n += 1; } catch { /* skip */ }
  }
  return n;
}

/** True when `dir` already holds a REGISTERED creds.json (a live session). */
function isLive(dir) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8'));
    return !!(c && c.registered && c.me && c.me.id);
  } catch { return false; }
}

/** Persist ONE session folder to MongoDB (immediate). Returns true on write. */
async function saveSession(number, dir) {
  if (!mongo.isReady()) return false;
  const n = clean(number);
  if (!/^[0-9]{8,15}$/.test(n)) return false;
  const files = readDir(dir || sessionDir(n));
  if (!Object.keys(files).length) return false;
  return mongo.setDoc(COLLECTION, n, { files, savedAt: new Date().toISOString() });
}

/**
 * Debounced mirror — call this from the creds.update hot path. It coalesces a
 * burst of updates into a single Mongo write ~1.5s later and never blocks.
 */
function scheduleMirror(number, dir, delay = DEBOUNCE_MS) {
  if (!mongo.isReady()) return;
  const n = clean(number);
  if (!/^[0-9]{8,15}$/.test(n)) return;
  const prev = pending.get(n);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    pending.delete(n);
    saveSession(n, dir).catch(() => {});
  }, delay);
  if (t.unref) t.unref();
  pending.set(n, t);
}

/** Mirror EVERY given session folder now (periodic safety net). */
async function mirrorAll(entries) {
  if (!mongo.isReady()) return 0;
  let n = 0;
  for (const e of entries || []) {
    const num = clean(typeof e === 'string' ? e : e?.number);
    if (!/^[0-9]{8,15}$/.test(num)) continue;
    const dir = (typeof e === 'object' && e?.dir) || sessionDir(num);
    try { if (await saveSession(num, dir)) n += 1; } catch { /* skip */ }
  }
  return n;
}

/** Restore ONE session from MongoDB into its folder. Returns files written. */
async function restoreSession(number, dir) {
  if (!mongo.isReady()) return 0;
  const n = clean(number);
  if (!/^[0-9]{8,15}$/.test(n)) return 0;
  const dest = dir || sessionDir(n);
  if (isLive(dest)) return 0; // don't clobber a working session
  const doc = await mongo.getDoc(COLLECTION, n);
  if (!doc || !doc.files) return 0;
  return writeDir(dest, doc.files);
}

/**
 * Restore EVERY session stored in MongoDB into SESSION_DIR. Called on boot
 * BEFORE the disk scan, so an ephemeral disk is rebuilt from the cloud copy.
 * Returns how many sessions were restored.
 */
async function restoreAll(baseDir) {
  if (!mongo.isReady()) return 0;
  const base = baseDir || path.resolve(config.SESSION_DIR);
  const docs = await mongo.listDocs(COLLECTION);
  let restored = 0;
  for (const d of docs) {
    const n = clean(d.id);
    if (!/^[0-9]{8,15}$/.test(n)) continue;
    const files = d.data && d.data.files;
    if (!files || !Object.keys(files).length) continue;
    const dest = path.join(base, n);
    if (isLive(dest)) continue; // already on disk — leave it alone
    const w = writeDir(dest, files);
    if (w) {
      restored += 1;
      console.log(`[SESSION-STORE] restored ${n} from MongoDB (${w} file(s))`);
    }
  }
  if (restored) console.log(`[SESSION-STORE] ${restored} session(s) rebuilt from MongoDB \u2705`);
  return restored;
}

/** Delete a session's cloud copy (on unlink / logout). */
async function deleteSession(number) {
  if (!mongo.isReady()) return false;
  const n = clean(number);
  if (!/^[0-9]{8,15}$/.test(n)) return false;
  const prev = pending.get(n);
  if (prev) { clearTimeout(prev); pending.delete(n); }
  return mongo.delDoc(COLLECTION, n);
}

/** List the sessions stored in the cloud (diagnostics / portal). */
async function list() {
  if (!mongo.isReady()) return [];
  const docs = await mongo.listDocs(COLLECTION);
  return docs.map((d) => ({
    number: d.id,
    savedAt: (d.data && d.data.savedAt) || null,
    files: Object.keys((d.data && d.data.files) || {}).length,
  }));
}

module.exports = {
  COLLECTION,
  sessionDir,
  saveSession,
  scheduleMirror,
  mirrorAll,
  restoreSession,
  restoreAll,
  deleteSession,
  list,
};
