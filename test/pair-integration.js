/**
 * Integration test for the FIXED pairing flow using the real lib/bot.js.
 * Usage: node test/pair-integration.js <number>
 */
process.env.SESSION_DIR = '/tmp/saqib-pair-it';
const fs = require('fs');
fs.rmSync('/tmp/saqib-pair-it', { recursive: true, force: true });

const bot = require('../lib/bot');

const number = String(process.argv[2] || '').replace(/[^0-9]/g, '');
const seen = [];

bot.events.on('code', (e) => { seen.push(['code', e]); console.log('EVENT code:', e); });
bot.events.on('linking', (e) => { seen.push(['linking', e]); console.log('EVENT linking:', e); });
bot.events.on('paired', (e) => { seen.push(['paired', e]); console.log('EVENT paired:', e); });
bot.events.on('error', (e) => { seen.push(['error', e]); console.log('EVENT error:', e); });

(async () => {
  console.log('>>> requestPair', number);
  try {
    const code = await bot.requestPair(number);
    console.log('>>> requestPair RESOLVED with code =', code);
  } catch (e) {
    console.log('>>> requestPair REJECTED:', e?.message || e);
  }
  // Watch a bit longer to make sure no 401 loop happens.
  setTimeout(() => {
    const dbg = require('../lib/debug').recent(50);
    console.log('>>> debug tail:');
    for (const d of dbg) console.log('   ', d.type, JSON.stringify(d.data));
    process.exit(0);
  }, 15000);
})();
