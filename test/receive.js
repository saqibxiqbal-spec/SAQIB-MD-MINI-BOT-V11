/**
 * SAQIB MD — receive-path test
 * ---------------------------
 * Simulates a REAL incoming WhatsApp message going through the full path:
 *   messages.upsert  ->  onMessagesUpsert  ->  handleMessage  ->  plugin
 * (the smoke test bypasses this; here we test prefix parsing + dispatch).
 *
 * Run: node test/receive.js
 */
const path = require('path');
const fs = require('fs');
const registry = require('../plugins/_registry');
const { handleMessage } = require('../lib/handler');
const config = require('../config');

// load plugins
const pluginsDir = path.join(__dirname, '..', 'plugins');
const plugins = [];
for (const f of fs.readdirSync(pluginsDir).filter((x) => x.endsWith('.js') && !x.startsWith('_'))) {
  const plug = require(path.join(pluginsDir, f));
  if (Array.isArray(plug.commands) && typeof plug.handler === 'function') plugins.push({ file: f, ...plug });
}
registry.set(plugins);
console.log(`loaded ${plugins.length} plugins, ${plugins.reduce((n, p) => n + p.commands.length, 0)} commands`);
console.log(`PREFIX = "${config.PREFIX}"  MODE = ${config.MODE}`);

const sent = [];
function mockSock() {
  return {
    user: { id: '923067846267:5@s.whatsapp.net' },
    sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'x' } }; },
    readMessages: async () => {},
    sendPresenceUpdate: async () => {},
    profilePictureUrl: async () => 'https://i.imgur.com/2yaf2wb.png',
    groupMetadata: async () => ({ subject: 'G', participants: [] }),
  };
}

function incoming(text, opts = {}) {
  const jid = opts.jid || '923001111111@s.whatsapp.net';
  return {
    key: { remoteJid: jid, id: 'MSG' + Math.random().toString(36).slice(2, 10).toUpperCase(), fromMe: false },
    message: { conversation: text },
    pushName: 'Tester',
    ...opts.extra,
  };
}

(async () => {
  const session = { number: '923067846267', ownerNumber: '923067846267' };
  const tests = ['.menu', '.ping', '.alive', '.help', 'menu', '.MENU', '.ping extra'];
  for (const t of tests) {
    sent.length = 0;
    const m = incoming(t);
    try {
      await handleMessage(mockSock(), m, session);
      // give async replies a tick
      await new Promise((r) => setTimeout(r, 400));
      const replied = sent.length > 0;
      console.log(`${replied ? '✅' : '❌'} "${t}" -> ${sent.length} reply(s)${replied ? ' | ' + String(sent[0].content?.text || sent[0].content?.caption || JSON.stringify(sent[0].content)).slice(0, 60).replace(/\n/g, ' ') : ' (NO REPLY)'}`);
    } catch (e) {
      console.log(`❌ "${t}" -> THREW: ${e?.message || e}`);
    }
  }
  console.log('\n--- raw first reply for .menu ---');
  sent.length = 0;
  await handleMessage(mockSock(), incoming('.menu'), session);
  await new Promise((r) => setTimeout(r, 500));
  console.log(JSON.stringify(sent[0]?.content || null).slice(0, 300));
  process.exit(0);
})();
