/**
 * SAQIB MD — in-memory debug ring buffer
 * -------------------------------------
 * Records the last N events (incoming messages, dispatched commands, errors)
 * so the live bot can be diagnosed WITHOUT access to the host's log stream.
 * Exposed read-only via GET /api/debug.
 */
const MAX = 200;

const events = [];

function push(type, data) {
  try {
    events.push({ t: Date.now(), type, data });
    if (events.length > MAX) events.splice(0, events.length - MAX);
  } catch { /* ignore */ }
}

const info = (msg, data) => push('info', { msg, ...(data || {}) });
const incoming = (data) => push('incoming', data);
const command = (data) => push('command', data);
const error = (msg, data) => push('error', { msg, ...(data || {}) });

function recent(n = 60) {
  return events.slice(-n);
}

function clear() { events.length = 0; }

module.exports = { push, info, incoming, command, error, recent, clear };
