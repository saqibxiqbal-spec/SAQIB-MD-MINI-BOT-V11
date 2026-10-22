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
const git = require('./gitBackend');

let MongoClient = null;
try { ({ MongoClient } = require('mongodb')); } catch { /* driver not installed */ }

let client = null;
let db = null;
let ready = false;
let connecting = null;
/** Which store is actually serving reads/writes: 'mongo' | 'git' | null */
let backend = null;

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
function enabled() {
  return (!!MongoClient && uriCandidates().length > 0) || git.enabled();
}
function isReady() { return ready; }
function activeBackend() { return backend; }

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
        backend = 'mongo';
        activeUri = u;
        // Fresh/empty database (e.g. new disk) but a GitHub state repo exists?
        // Seed it from there so the owner's settings are not lost.
        try {
          const probe = await db.collection('settings').findOne({ _id: 'global' });
          if (!probe && git.enabled() && (await git.load())) {
            const gs = await git.status();
            let copied = 0;
            for (const col of gs.collections || []) {
              if (col === 'sessions') continue;
              const docs = await git.listDocs(col);
              for (const d of docs) {
                if (d.data === undefined) continue;
                await db.collection(col).updateOne(
                  { _id: d.id },
                  { $set: { data: d.data, updatedAt: new Date() } },
                  { upsert: true },
                );
                copied += 1;
              }
            }
            if (copied) console.log(`[MONGO] seeded ${copied} doc(s) from GitHub state repo \u2705`);
          }
        } catch (e) {
          console.error('[MONGO] seed from git failed:', (e?.message || e).split('\n')[0]);
        }
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
    // Last resort: a private GitHub repo. Same API, so nothing else changes.
    if (git.enabled()) {
      const ok = await git.load();
      if (ok) {
        ready = true;
        backend = 'git';
        console.log(`[MONGO] using GitHub state repo \u2705 (${process.env.GITHUB_STATE_REPO || 'saqibxiqbal-spec/saqib-md-state'})`);
        connecting = null;
        return true;
      }
      console.error('[MONGO] GitHub state repo unreachable too:', (await git.status()).lastError);
    }
    console.error(`[MONGO] all ${candidates.length} endpoint(s) unreachable \u2014 running on local files only`);
    connecting = null;
    return false;
  })();
  return connecting;
}

/** Read a named document's `data` field (or null). */
async function getDoc(name, id = 'global') {
  if (backend === 'git') return git.getDoc(name, id);
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
  if (backend === 'git') return git.setDoc(name, id, data);
  if (!ready) return false;
  // Dual-write: keep the GitHub mirror in sync so a move to another host
  // (empty disk, unreachable Atlas) still restores settings. Session folders
  // are EXCLUDED: a busy account has thousands of key files (~14 MB), which
  // would bloat the repo and exceed the contents-API size limit.
  if (git.enabled() && name !== 'sessions') git.setDoc(name, id, data).catch(() => {});
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
  if (backend === 'git') return git.listDocs(name);
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
  if (backend === 'git') return git.delDoc(name, id);
  if (!ready) return false;
  if (git.enabled() && name !== 'sessions') git.delDoc(name, id).catch(() => {});
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
    db: backend === 'mongo' && ready ? db.databaseName : null,
    backend,
    host: backend === 'mongo' && ready ? (client?.options?.hosts?.[0] || null) : null,
    endpoint: backend === 'mongo' && ready ? (activeUri === fallbackUri() ? 'fallback' : 'primary') : null,
    candidates: uriCandidates().length,
    git: backend === 'git' ? await git.status() : undefined,
  };
}

async function close() {
  try { await git.flush(); } catch { /* ignore */ }
  try { await client?.close(); } catch { /* ignore */ }
  ready = false; client = null; db = null; backend = null;
}

module.exports = { init, enabled, isReady, activeBackend, getDoc, setDoc, listDocs, delDoc, status, close, flush: () => git.flush() };
