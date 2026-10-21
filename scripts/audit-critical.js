/**
 * SAQIB MD — critical command-routing regression guard.
 *
 * Guards the bug where chemistry.js (loaded first, alphabetically) hijacked
 * short element symbols that are really other plugins' commands:
 *   .s  -> media.js   (sticker)   [was: chemistry.js "SULFUR"]
 *   .cd -> tools.js   (countdown) [was: chemistry.js "Cadmium"]
 *   .no -> reactions.js (❌)       [was: chemistry.js "Nobelium"]
 *
 * Also guards the other resolved duplicates (chad / currency / dua / prophet).
 *
 * Run: node scripts/audit-critical.js
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'plugins');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== '_registry.js').sort();

const list = [];
for (const f of files) {
  try {
    const p = require(path.join(dir, f));
    if (p && Array.isArray(p.commands)) list.push(Object.assign({}, p, { __file: f }));
  } catch (e) {
    console.error(`  ✗ failed to load ${f}: ${e.message}`);
    process.exitCode = 1;
  }
}

const reg = require('../plugins/_registry.js');
reg.set(list);

// command -> the plugin file that MUST own it
const EXPECTED = {
  s: 'media.js',
  sticker: 'media.js',
  cd: 'tools.js',
  no: 'reactions.js',
  chad: 'characters.js',
  currency: 'tools.js',
  exchange: 'tools.js',
  fx: 'tools.js',
  dua: 'islamic.js',
  prophet: 'islamic2.js',
  element: 'chemistry.js',
  country: 'countries.js',
  capital: 'countries.js',
};

let bad = 0;
console.log('\n=== CRITICAL COMMAND ROUTING ===');
for (const [cmd, want] of Object.entries(EXPECTED)) {
  const owner = reg.find(cmd);
  const got = owner ? owner.__file : '(none)';
  const ok = got === want;
  if (!ok) bad++;
  console.log(`  ${ok ? '✅' : '❌'} .${cmd.padEnd(10)} -> ${got}${ok ? '' : `  (expected ${want})`}`);
}

console.log(`\n=== RESULT: ${bad === 0 ? 'PASS' : 'FAIL'} (${bad} bad) ===\n`);
if (bad) process.exit(1);
