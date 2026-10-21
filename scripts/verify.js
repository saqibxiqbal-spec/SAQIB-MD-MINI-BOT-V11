/**
 * SAQIB MD — command verification harness
 * --------------------------------------
 * Loads every plugin exactly like index.js does, then reports:
 *   - total plugins / commands
 *   - duplicate command names (a command claimed by 2+ plugins)
 *   - commands with no handler coverage
 *   - category breakdown
 * Run:  node scripts/verify.js
 */
const fs = require('fs');
const path = require('path');

const pluginsDir = path.join(__dirname, '..', 'plugins');
const plugins = [];
for (const f of fs.readdirSync(pluginsDir).filter((x) => x.endsWith('.js') && !x.startsWith('_'))) {
  try {
    const plug = require(path.join(pluginsDir, f));
    if (Array.isArray(plug.commands) && typeof plug.handler === 'function') {
      plugins.push({ file: f, ...plug });
    } else {
      console.log(`SKIP (no commands/handler): ${f}`);
    }
  } catch (e) {
    console.log(`LOAD FAIL: ${f} -> ${e.message}`);
  }
}

const seen = new Map();
const dups = [];
const cats = {};
for (const p of plugins) {
  const c = p.category || 'OTHER';
  cats[c] = cats[c] || [];
  for (const cmd of p.commands) {
    if (seen.has(cmd)) dups.push(`${cmd}  (${seen.get(cmd)} & ${p.file})`);
    else { seen.set(cmd, p.file); cats[c].push(cmd); }
  }
}

console.log('\n================ SAQIB MD VERIFY ================');
console.log(`Plugins : ${plugins.length}`);
console.log(`Commands: ${seen.size}`);
console.log(`Categories: ${Object.keys(cats).length}`);
console.log('\n--- per category ---');
for (const [c, list] of Object.entries(cats)) console.log(`${c} (${list.length}): ${list.join(', ')}`);
console.log('\n--- duplicates ---');
console.log(dups.length ? dups.join('\n') : 'none ✅');
console.log('\n--- hooks (onMessage) ---');
console.log(plugins.filter((p) => typeof p.onMessage === 'function').map((p) => p.file).join(', ') || 'none');
console.log('=================================================\n');
