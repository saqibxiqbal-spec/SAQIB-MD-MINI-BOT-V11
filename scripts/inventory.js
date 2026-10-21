/**
 * Command inventory + duplicate detector.
 * Usage: node scripts/inventory.js
 */
const fs = require('fs');
const path = require('path');

const pluginsDir = path.join(__dirname, '..', 'plugins');
const registry = require('../plugins/_registry');

const plugins = [];
for (const f of fs.readdirSync(pluginsDir).filter((x) => x.endsWith('.js') && !x.startsWith('_'))) {
  try {
    const p = require(path.join(pluginsDir, f));
    if (p && p.commands) plugins.push({ file: f, ...p });
  } catch (e) {
    console.log('ERR loading', f, '-', e.message);
  }
}
registry.set(plugins);

const total = plugins.reduce((n, p) => n + p.commands.length, 0);
console.log(`\n=== SAQIB MD COMMAND INVENTORY ===`);
console.log(`plugin files: ${plugins.length}`);
console.log(`commands:     ${total}\n`);

const seen = new Map();
for (const p of plugins) for (const c of p.commands) {
  if (!seen.has(c)) seen.set(c, []);
  seen.get(c).push(p.file);
}
const dups = [...seen.entries()].filter(([, f]) => f.length > 1);
console.log(`unique commands: ${seen.size}`);
console.log(`duplicate names: ${dups.length}`);
if (dups.length) {
  console.log('\n-- duplicates (first-loaded plugin wins) --');
  for (const [c, f] of dups) console.log(`  ${c}  ->  ${f.join(', ')}`);
}

console.log('\n-- per plugin --');
for (const p of plugins) {
  console.log(`  ${p.file.padEnd(18)} ${String(p.commands.length).padStart(4)}  ${p.category || ''}`);
}

// write inventory json
const out = { total, unique: seen.size, plugins: plugins.map((p) => ({ file: p.file, category: p.category, count: p.commands.length, commands: p.commands })) };
fs.writeFileSync(path.join(__dirname, '..', 'command-inventory.json'), JSON.stringify(out, null, 2));
console.log('\nwrote command-inventory.json');
