/**
 * SAQIB MD — self-healing error reporter
 * --------------------------------------
 * When a command throws, this module:
 *   1. records the error (deduped, so one broken command can't spam)
 *   2. tries known AUTOMATIC fixes (safe, self-contained recoveries)
 *   3. reports to the owner on WhatsApp, with the error + what it did
 *
 * Design rules (from Queen Dua):
 *   - Never message the owner for the same error over and over.
 *   - Never invent a "fix" that could make things worse: only a small set of
 *     provably-safe recoveries run automatically; everything else is reported
 *     so it can be fixed properly.
 *   - Zero external calls, zero cost.
 */
const config = require('../config');
const debug = require('./debug');

/** signature -> { count, firstAt, lastAt, reported } */
const SEEN = new Map();
const COOLDOWN_MS = 10 * 60 * 1000;   // don't re-report the same error within 10 min
const MAX_TRACKED = 300;

let notifyFn = null;   // set by index.js: (text) => Promise

/** Called once at boot so this module can reach the owner. */
function setNotifier(fn) { notifyFn = fn; }

/** A stable identity for an error, so repeats collapse into one entry. */
function signature(command, err) {
  const msg = String((err && err.message) || err || 'unknown');
  return `${command || '?'}::${msg.slice(0, 120)}`;
}

/**
 * Known-safe automatic recoveries.
 * Each returns a short description when it actually did something, else null.
 * These must be things that CANNOT lose data or change user settings.
 */
const AUTO_FIXES = [
  {
    name: 'clear group metadata cache',
    // A stale/failed groupMetadata read is the most common transient failure;
    // dropping the cache makes the next call re-fetch.
    when: (msg) => /groupMetadata|group metadata|not-authorized|forbidden/i.test(msg),
    run: () => {
      try {
        const h = require('./handler');
        if (typeof h.clearGroupMetaCache === 'function') { h.clearGroupMetaCache(); return 'group metadata cache saaf kar di'; }
      } catch { /* ignore */ }
      return null;
    },
  },
  {
    name: 'reload settings from disk',
    when: (msg) => /ENOENT|EACCES|settings|JSON/i.test(msg),
    run: () => {
      try {
        const s = require('./settings');
        if (typeof s.load === 'function') { s.load(); return 'settings dobara load kar li'; }
      } catch { /* ignore */ }
      return null;
    },
  },
];

/**
 * Report a command error. Safe to call from anywhere; never throws.
 * Returns the action taken, for tests.
 */
async function report(command, err, meta = {}) {
  let sig, entry;
  try {
    sig = signature(command, err);
    entry = SEEN.get(sig);
    const now = Date.now();
    if (!entry) {
      entry = { count: 0, firstAt: now, lastAt: now, reported: 0, msg: '', stack: '', command: '' };
      SEEN.set(sig, entry);
      if (SEEN.size > MAX_TRACKED) {
        const oldest = [...SEEN.entries()].sort((a, b) => a[1].lastAt - b[1].lastAt)[0];
        if (oldest) SEEN.delete(oldest[0]);
      }
    }
    entry.count += 1;
    entry.lastAt = now;

    const msg = String((err && err.message) || err || 'unknown');
    // Keep the latest detail so `.heel` can hand the owner a copy-pasteable
    // report (message + a few stack frames) without re-running the command.
    entry.msg = msg.slice(0, 400);
    entry.command = command || '(unknown)';
    entry.stack = String((err && err.stack) || '').split('\n').slice(0, 4).join('\n');

    // 1) try the safe automatic recoveries
    const fixed = [];
    for (const f of AUTO_FIXES) {
      try {
        if (!f.when(msg)) continue;
        const res = f.run();
        if (res) fixed.push(`${f.name}: ${res}`);
      } catch { /* a failed fix must never break the reporter */ }
    }

    // 2) report to the owner — but respect the cooldown so a loop can't spam
    const sinceLast = now - (entry.reported || 0);
    const shouldReport = entry.reported === 0 || sinceLast > COOLDOWN_MS;
    if (shouldReport && notifyFn) {
      entry.reported = now;
      const lines = [
        '🛠️ *Self-Heal Report*',
        '',
        `⌨️ Command: *${command || '(unknown)'}*`,
        `❗ Error: ${msg.slice(0, 300)}`,
        `🔁 Is error ki total aawazein: ${entry.count}`,
      ];
      if (fixed.length) lines.push('', '✅ *Auto-fix:*', ...fixed.map((f) => `▸ ${f}`));
      else lines.push('', 'ℹ️ Koi safe auto-fix nahi mila — report kar diya.');
      if (meta.senderNum) lines.push('', `👤 Sender: ${meta.senderNum}`);
      if (meta.isGroup) lines.push('📍 Group: ' + (meta.from || ''));
      try { await notifyFn(lines.join('\n')); } catch { /* ignore */ }
    }
    return { sig, count: entry.count, fixed, reported: shouldReport };
  } catch {
    return null;
  }
}

/** Snapshot for a `.heal` command / diagnostics. */
function stats() {
  return [...SEEN.entries()]
    .map(([sig, e]) => ({ sig, ...e }))
    .sort((a, b) => b.count - a.count);
}

function reset() { SEEN.clear(); }

module.exports = { setNotifier, report, stats, reset };
