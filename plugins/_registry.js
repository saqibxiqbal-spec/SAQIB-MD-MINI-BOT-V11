/**
 * SAQIB MD — internal plugin registry
 * index.js populates it after loading all plugins.
 * Uses a Map for O(1) command lookup (speed).
 * Also collects per-message hooks (plugins exporting `onMessage`).
 */
let allPlugins = [];
let index = new Map();
let hooks = [];

module.exports = {
  set: (list) => {
    allPlugins = list;
    index = new Map();
    hooks = [];
    for (const p of list) {
      for (const cmd of p.commands) {
        if (!index.has(cmd)) index.set(cmd, p); // first plugin wins
      }
      if (typeof p.onMessage === 'function') hooks.push(p.onMessage);
    }
  },
  all: () => allPlugins,
  /** Find the plugin that owns a given command (O(1)) */
  find: (command) => index.get(command),
  /** Per-message hooks (antilink, antidelete, autoreact, chatbot, …) */
  hooks: () => hooks,
};
