/**
 * SAQIB MD — MongoDB persistence
 * ------------------------------
 * On ephemeral-disk hosts the local disk is EPHEMERAL: `saqib-settings.json`
 * (and the other runtime files) are wiped on every restart / redeploy, so a
 * toggle you turned ON comes back OFF. This module stores those runtime stores
 * in MongoDB instead, so they survive restarts.
 *
 * Design:
 *   - One tiny collection holds named documents: { _id, data, updatedAt }.
 *   - `data` is the SAME JSON blob the local file holds, so nothing else in the
 *     codebase has to change shape.
 *   - The local file stays as a fast cache; MongoDB is the source of truth.
 *   - Everything is optional + fail-safe: if MONGODB_URI is not set, or Mongo is
 *     unreachable, the bot keeps working exactly as before (local files only).
 *
 * Enable by setting MONGODB_URI (see .env.example). Optional MONGODB_DB.
 */
const config = require('../config');

let MongoClient = null;
try { ({ MongoClient } = require('mongodb')); } catch { /* driver not installed */ }

let client = null;
let db = null;
let ready = false;
let connecting = null;

let activeUri = null;

/** Primary URI (Atlas / cloud). */
function uri() {
  return String(process.env.MONGODB_URI || config.MONGODB_URI || '').trim();
}
/** Optional local/self-hosted fallback used when the primary is unreachable. */
function fallbackUri() {
  return String(process.env.MONGODB_URI_FALLBACK || '').trim();
}
/** Ordered list of candidate URIs (primary first, then fallback). */
function uriCandidates() {
  const list = [uri(), fallbackUri()].filter(Boolean);
  return [...new Set(list)];
}
function enabled() { return !!MongoClient && uriCandidates().length > 0; }
function isReady() { return ready; }

/**
 * Connect once. Safe to call many times (returns the same in-flight promise).
 * Never throws — returns true/false.
 */
async function init() {
  if (ready) return true;
  if (!enabled()) return false;
  if (connecting) return connecting;
  connecting = (async () => {
    const dbName = String(process.env.MONGODB_DB || config.MONGODB_DB || 'saqib_md');
    const candidates = uriCandidates();
    for (const u of candidates) {
      const label = u === fallbackUri() ? 'fallback' : 'primary';
      try {
        client = new MongoClient(u, {
          serverSelectionTimeoutMS: 8000,
          connectTimeoutMS: 15000,
          socketTimeoutMS: 30000,
        });
        await client.connect();
        db = client.db(dbName);
        // Touch the collection so a bad db name fails fast.
        await db.collection('kv').findOne({ _id: '__ping__' });
        ready = true;
        activeUri = u;
        const host = (() => { try { return new URL(u.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://')).host; } catch { return '?'; } })();
        console.log(`[MONGO] connected \u2705 (${label}: ${host})`);
        return true;
      } catch (e) {
        console.error(`[MONGO] ${label} connect failed:`, (e?.message || e).split('\n')[0]);
        ready = false;
        try { await client?.close(); } catch { /* ignore */ }
        client = null; db = null;
      }
    }
    console.error(`[MONGO] all ${candidates.length} endpoint(s) unreachable \u2014 running on local files only`);
    connecting = null;
    return false;
  })();
  return connecting;
}

/** Read a named document's `data` field (or null). */
async function getDoc(name, id = 'global') {
  if (!ready) return null;
  try {
    const d = await db.collection(name).findOne({ _id: id });
    return d ? d.data : null;
  } catch (e) {
    console.error(`[MONGO] get ${name} fail:`, e?.message || e);
    return null;
  }
}

/** Upsert a named document's `data` field. */
async function setDoc(name, id = 'global', data) {
  if (!ready) return false;
  try {
    await db.collection(name).updateOne(
      { _id: id },
      { $set: { data, updatedAt: new Date() } },
      { upsert: true },
    );
    return true;
  } catch (e) {
    console.error(`[MONGO] set ${name} fail:`, e?.message || e);
    return false;
  }
}

/** List every document in a collection as `{ id, data, updatedAt }`. */
async function listDocs(name) {
  if (!ready) return [];
  try {
    const arr = await db.collection(name).find({}).toArray();
    return arr.map((d) => ({ id: d._id, data: d.data, updatedAt: d.updatedAt }));
  } catch (e) {
    console.error(`[MONGO] list ${name} fail:`, e?.message || e);
    return [];
  }
}

/** Delete a named document. Returns true when a document was removed. */
async function delDoc(name, id = 'global') {
  if (!ready) return false;
  try {
    const r = await db.collection(name).deleteOne({ _id: id });
    return !!r?.deletedCount;
  } catch (e) {
    console.error(`[MONGO] del ${name} fail:`, e?.message || e);
    return false;
  }
}

/** Diagnostics for the portal / `.db` command. */
async function status() {
  return {
    enabled: enabled(),
    connected: ready,
    db: ready ? db.databaseName : null,
    host: ready ? (client?.options?.hosts?.[0] || null) : null,
    endpoint: ready ? (activeUri === fallbackUri() ? 'fallback' : 'primary') : null,
    candidates: uriCandidates().length,
  };
}

async function close() {
  try { await client?.close(); } catch { /* ignore */ }
  ready = false; client = null; db = null;
}

module.exports = { init, enabled, isReady, getDoc, setDoc, listDocs, delDoc, status, close };
