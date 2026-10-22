/**
 * SAQIB MD — Git-backed persistence (last-resort backend)
 * ------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------
 * MongoDB Atlas rejects this host's IP with "SSL alert number 80" and the
 * API key we have is only ORG_MEMBER, so it cannot add an access-list entry.
 * A local mongod fixes that inside this sandbox, but a redeploy on another
 * host starts from an empty disk again.
 *
 * This module stores the SAME `{ collection: { id: data } }` shape in ONE
 * JSON file inside a PRIVATE GitHub repo. It exposes exactly the same
 * getDoc / setDoc / listDocs / delDoc API as lib/mongo.js, so every module
 * (settings, prefixes, reacts, react-settings, user-settings, bans, api-keys,
 * sessions) keeps working without a single change.
 *
 * Writes are debounced (one commit per ~10s at most) so toggling a setting
 * does not spam the repo history.
 *
 * Enable with:
 *   GITHUB_TOKEN=ghp_xxx
 *   GITHUB_STATE_REPO=owner/private-repo   (default: saqibxiqbal-spec/saqib-md-state)
 *   GITHUB_STATE_PATH=state.json           (optional)
 */
const TOKEN = () => String(process.env.GITHUB_TOKEN || '').trim();
const REPO = () => String(process.env.GITHUB_STATE_REPO || 'saqibxiqbal-spec/saqib-md-state').trim();
const FILE = () => String(process.env.GITHUB_STATE_PATH || 'state.json').trim();
const BRANCH = () => String(process.env.GITHUB_STATE_BRANCH || 'main').trim();

const API = 'https://api.github.com';
const DEBOUNCE_MS = 8000;

let state = {};        // { collection: { id: data } }
let sha = null;        // blob sha of the remote file
let loaded = false;
let dirty = false;
let timer = null;
let flushing = null;
let lastFlush = 0;
let lastError = null;

function enabled() {
  return !!TOKEN() && !!REPO();
}

function headers() {
  return {
    Authorization: `token ${TOKEN()}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'SAQIB-MD',
  };
}

function contentsUrl() {
  return `${API}/repos/${REPO()}/contents/${encodeURIComponent(FILE())}`;
}

/** Fetch the remote file. Never throws. */
async function load() {
  if (!enabled()) return false;
  if (loaded) return true;
  try {
    const res = await fetch(`${contentsUrl()}?ref=${encodeURIComponent(BRANCH())}`, { headers: headers() });
    if (res.status === 404) {
      state = {};
      sha = null;
      loaded = true;
      return true;
    }
    if (!res.ok) {
      lastError = `load ${res.status}`;
      return false;
    }
    const j = await res.json();
    sha = j.sha || null;
    const raw = Buffer.from(j.content || '', 'base64').toString('utf8');
    const parsed = raw ? JSON.parse(raw) : {};
    state = parsed && typeof parsed === 'object' ? parsed : {};
    loaded = true;
    return true;
  } catch (e) {
    lastError = e?.message || String(e);
    return false;
  }
}

function schedule() {
  dirty = true;
  if (timer) return;
  const wait = Math.max(0, DEBOUNCE_MS - (Date.now() - lastFlush));
  timer = setTimeout(() => {
    timer = null;
    flush().catch(() => {});
  }, wait);
  if (timer.unref) timer.unref();
}

/** Push the in-memory state to GitHub. Serialised; retries on sha conflict. */
async function flush() {
  if (!enabled() || !dirty) return true;
  if (flushing) return flushing;
  flushing = (async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const body = JSON.stringify(state, null, 2);
        const payload = {
          message: `state: ${new Date().toISOString()}`,
          content: Buffer.from(body, 'utf8').toString('base64'),
          branch: BRANCH(),
        };
        if (sha) payload.sha = sha;
        const res = await fetch(contentsUrl(), {
          method: 'PUT',
          headers: headers(),
          body: JSON.stringify(payload),
        });
        if (res.status === 409 || res.status === 422) {
          // Someone else wrote first — re-read sha and retry.
          loaded = false;
          await load();
          continue;
        }
        if (!res.ok) {
          lastError = `flush ${res.status}`;
          return false;
        }
        const j = await res.json();
        sha = j?.content?.sha || sha;
        dirty = false;
        lastFlush = Date.now();
        lastError = null;
        return true;
      } catch (e) {
        lastError = e?.message || String(e);
      }
    }
    return false;
  })();
  try { return await flushing; } finally { flushing = null; }
}

/* ------------------------------ public API ------------------------------ */

async function getDoc(name, id = 'global') {
  if (!loaded) await load();
  const col = state[name];
  if (!col || !(id in col)) return null;
  return col[id];
}

async function setDoc(name, id = 'global', data) {
  if (!loaded) await load();
  if (!state[name]) state[name] = {};
  state[name][id] = data;
  schedule();
  return true;
}

async function listDocs(name) {
  if (!loaded) await load();
  const col = state[name] || {};
  return Object.entries(col).map(([id, data]) => ({ id, data, updatedAt: null }));
}

async function delDoc(name, id = 'global') {
  if (!loaded) await load();
  if (!state[name] || !(id in state[name])) return false;
  delete state[name][id];
  if (!Object.keys(state[name]).length) delete state[name];
  schedule();
  return true;
}

async function status() {
  return {
    enabled: enabled(),
    loaded,
    repo: REPO(),
    file: FILE(),
    collections: Object.keys(state),
    dirty,
    lastError,
  };
}

module.exports = { enabled, load, flush, getDoc, setDoc, listDocs, delDoc, status };
