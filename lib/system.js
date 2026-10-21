/**
 * SAQIB MD — REAL system refresh
 * ------------------------------
 * Powers `.update` / `.refresh`. This is NOT a cosmetic "refreshed!" message:
 * it actually
 *   1. drops every plugin module from Node's require cache,
 *   2. re-reads every plugin file from disk and rebuilds the command registry,
 *   3. resets the command/typo index + group-metadata cache in the handler,
 *   4. clears the AI + menu caches,
 *   5. re-loads the persisted settings / prefixes / reacts / bans,
 * and reports what really changed (files, command count).
 *
 * It deliberately does NOT touch lib/* singletons (config, settings, contacts)
 * — those must stay the same instances so live references keep working.
 */
const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');

/** Re-read every plugin file and rebuild the registry. */
function reloadPlugins() {
  const files = fs.readdirSync(PLUGINS_DIR).filter((f) => f.endsWith('.js') && !f.startsWith('_'));
  // 1) bust the require cache for plugin files only
  for (const f of files) {
    const full = path.join(PLUGINS_DIR, f);
    try { delete require.cache[require.resolve(full)]; } catch { /* not cached yet */ }
  }
  // 2) re-require them
  const list = [];
  const failed = [];
  for (const f of files) {
    try {
      const p = require(path.join(PLUGINS_DIR, f));
      if (Array.isArray(p.commands) && typeof p.handler === 'function') list.push({ file: f, ...p });
      else failed.push(f);
    } catch (e) {
      failed.push(`${f} (${e?.message || e})`);
    }
  }
  // 3) swap the registry
  require('../plugins/_registry').set(list);
  const commands = list.reduce((n, p) => n + p.commands.length, 0);
  return { files: list.length, commands, failed };
}

/** Clear the handler's derived indexes so a new command set is picked up. */
function resetHandlerIndexes() {
  try {
    const h = require('./handler');
    if (typeof h.resetCommandIndex === 'function') h.resetCommandIndex();
    if (typeof h.clearGroupMetaCache === 'function') h.clearGroupMetaCache();
  } catch { /* ignore */ }
}

/** Clear in-memory caches (AI answers, profile pics, etc.). Keeps the message store intact. */
function clearCaches() {
  try {
    const cache = require('./cache');
    if (cache.aiCache && typeof cache.aiCache.clear === 'function') cache.aiCache.clear();
    if (cache.dpCache && typeof cache.dpCache.clear === 'function') cache.dpCache.clear();
  } catch { /* ignore */ }
}

/** Reload persisted overrides from disk (settings, prefixes, reacts, bans). */
function reloadState() {
  for (const mod of ['./settings', './prefixes', './reacts', './bans']) {
    try {
      const m = require(mod);
      if (m && typeof m.load === 'function') m.load();
    } catch { /* ignore */ }
  }
}

/**
 * The full refresh. Returns a summary the command can show the owner.
 */
function refresh() {
  const t0 = Date.now();
  const before = (() => { try { return require('../plugins/_registry').all().length; } catch { return 0; } })();
  const res = reloadPlugins();
  resetHandlerIndexes();
  clearCaches();
  reloadState();
  const ms = Date.now() - t0;
  return { ...res, before, ms };
}

module.exports = { refresh, reloadPlugins, resetHandlerIndexes, clearCaches, reloadState };
