#!/usr/bin/env node
/**
 * SAQIB MD — create a SESSION_ID backup string.
 *
 * Packs the `session/` folder into a tar.gz and prints its base64. Paste the
 * output into the SESSION_ID config var on your host (Render / Railway / etc.)
 * so every linked number reconnects automatically after a restart.
 *
 * Usage:
 *   node scripts/make-session-id.js            # prints the base64 string
 *   node scripts/make-session-id.js --out id.txt
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../config');

const base = path.resolve(config.SESSION_DIR);
if (!fs.existsSync(base)) {
  console.error(`❌ Session folder not found: ${base}`);
  console.error('   Pair at least one number first, then run this again.');
  process.exit(1);
}

const dirs = fs.readdirSync(base).filter((d) => /^[0-9]{8,15}$/.test(d));
if (!dirs.length) {
  console.error('❌ No linked sessions found — pair a number first.');
  process.exit(1);
}

let buf;
try {
  buf = execFileSync('tar', ['-czf', '-', '-C', base, '.'], { maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  console.error('❌ tar failed:', e?.message || e);
  process.exit(1);
}

const id = buf.toString('base64');
const outIdx = process.argv.indexOf('--out');
if (outIdx >= 0 && process.argv[outIdx + 1]) {
  fs.writeFileSync(process.argv[outIdx + 1], id);
  console.log(`✅ SESSION_ID written to ${process.argv[outIdx + 1]} (${dirs.length} session(s), ${id.length} chars)`);
} else {
  console.log(`✅ SESSION_ID ready (${dirs.length} session(s), ${id.length} chars):\n`);
  console.log(id);
}
