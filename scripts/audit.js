/**
 * Full offline audit — loads every plugin, checks config defaults, duplicate
 * commands, and reports the final command inventory. Run: node scripts/audit.js
 */
const fs = require('fs');
const path = require('path');

let errors = 0;
const warn = (m) => { errors++; console.log('  \u274c ' + m); };
const good = (m) => console.log('  \u2705 ' + m);

console.log('\n=== 1. Load every plugin ===');
const dir = path.join(__dirname, '..', 'plugins');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const seen = new Map();
let total = 0;
for (const f of files) {
  try {
    const mod = require(path.join(dir, f));
    const cmds = Array.isArray(mod.commands) ? mod.commands : [];
    total += cmds.length;
    for (const c of cmds) {
      if (seen.has(c)) warn(`duplicate command "${c}" in ${f} (also ${seen.get(c)})`);
      else seen.set(c, f);
    }
    good(`${f.padEnd(18)} ${cmds.length} cmds`);
  } catch (e) {
    warn(`${f} FAILED TO LOAD: ${e.message}`);
  }
}
console.log(`\n  total commands: ${total} | unique: ${seen.size}`);

console.log('\n=== 2. Config defaults ===');
const config = require('../config');
const checks = [
  ['AUTOGREET is false (no unsolicited auto-messages)', config.AUTOGREET === false],
  ['AUTO_READ is false', config.AUTO_READ === false],
  ['AUTO_REACT is false (opt-in)', config.AUTO_REACT === false],
  ['ANTIDELETE is false', config.ANTIDELETE === false],
  ['ANTIDELETE_INBOX is false', config.ANTIDELETE_INBOX === false],
  ['DEFAULT_FONT is mono', String(config.DEFAULT_FONT).toLowerCase() === 'mono'],
  ['MODE is public', String(config.MODE).toLowerCase() === 'public'],
  ['PREFIX is "."', config.PREFIX === '.'],
  ['OWNER_NUMBER present', /^[0-9]{7,}$/.test(String(config.OWNER_NUMBER))],
];
for (const [name, cond] of checks) (cond ? good : warn)(name);

console.log('\n=== 3. Core libs load ===');
for (const lib of ['bot', 'handler', 'contacts', 'interactions', 'helpers', 'settings']) {
  try { require('../lib/' + lib); good(`lib/${lib}.js`); }
  catch (e) { warn(`lib/${lib}.js FAILED: ${e.message}`); }
}

console.log('\n=== 4. Fonts surrogate-pair sanity ===');
{
  const fonts = require('../plugins/fonts');
  // every named style must transform ASCII without producing U+FFFD
  let bad = 0;
  for (const name of Object.keys(fonts.NAMED || {})) {
    try {
      const out = fonts.style('ABCxyz', fonts.NAMED[name]);
      if (out.includes('\uFFFD') || out.includes('?')) { bad++; warn(`font "${name}" produced ?/FFFD: ${out}`); }
    } catch (e) { bad++; warn(`font "${name}" threw: ${e.message}`); }
  }
  if (!bad) good(`all ${Object.keys(fonts.NAMED || {}).length} named fonts clean`);
}

console.log('\n=== 5. Boot smoke test (require().member resolves) ===');
{
  // Scan source files for `require('<path>').<member>` and make sure the module
  // actually exports <member>. This catches the "warmupHosts is not a function"
  // class of crash that only surfaces at runtime on the server.
  const roots = ['index.js', ...fs.readdirSync(path.join(__dirname, '..', 'lib')).filter((f) => f.endsWith('.js')).map((f) => 'lib/' + f)];
  let checked = 0, missing = 0;
  for (const rel of roots) {
    const abs = path.join(__dirname, '..', rel);
    const src = fs.readFileSync(abs, 'utf8');
    const re = /require\((['"])(\.{1,2}\/[^'"]+)\1\)\.([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = re.exec(src))) {
      const target = m[2];
      const member = m[3];
      try {
        const mod = require(path.join(path.dirname(abs), target));
        checked++;
        if (mod[member] === undefined) { missing++; warn(`${rel}: require('${target}').${member} is NOT exported`); }
      } catch { /* module may need runtime deps; ignore */ }
    }
  }
  if (!missing) good(`all ${checked} require().member references resolve`);
}

console.log(`\n=== AUDIT RESULT: ${errors === 0 ? 'PASS (0 issues)' : errors + ' issue(s)'} ===\n`);
process.exit(errors ? 1 : 0);
