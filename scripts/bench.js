/**
 * SAQIB MD — hot-path micro-benchmark.
 * Measures command dispatch + typo-correction cost (the per-message CPU path).
 * Run: node scripts/bench.js
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'plugins');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== '_registry.js').sort();
const list = [];
for (const f of files) {
  try { const p = require(path.join(dir, f)); if (p && Array.isArray(p.commands)) list.push(Object.assign({}, p, { __file: f })); }
  catch { /* skip */ }
}
const registry = require('../plugins/_registry.js');
registry.set(list);
const handler = require('../lib/handler');

const N = 20000;
const unknown = ['pign', 'menue', 'hlep', 'stikr', 'downlod', 'xyzzyq', 'pongg', 'aliv'];

// warm
for (let i = 0; i < 1000; i++) registry.find('ping');

// 1) pure Map lookup (known command)
let t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) registry.find('ping');
let ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`registry.find (known)     : ${(ms / N * 1000).toFixed(3)} µs/op  (${ms.toFixed(1)}ms / ${N})`);

// 2) typo-correction via handleMessage path (unknown command -> closestCommand)
const sock = {
  user: { id: '923106762478:1@s.whatsapp.net' },
  sendMessage: async () => ({ key: { id: 'x' } }),
  readMessages: async () => {}, sendPresenceUpdate: async () => {},
  groupMetadata: async () => ({ participants: [] }),
};
async function runUnknown() {
  const t = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    const m = { key: { remoteJid: '923106762478@s.whatsapp.net', id: 'B' + i, fromMe: false }, message: { conversation: '.' + unknown[i % unknown.length] }, pushName: 'Bench' };
    await handler.handleMessage(sock, m, { number: '923106762478' });
  }
  return Number(process.hrtime.bigint() - t) / 1e6;
}

(async () => {
  const ms2 = await runUnknown();
  console.log(`handleMessage (unknown cmd): ${(ms2 / N * 1000).toFixed(3)} µs/op  (${ms2.toFixed(1)}ms / ${N})`);
  console.log(`  -> ${(N / (ms2 / 1000)).toFixed(0)} msgs/sec (single core)`);
})();
