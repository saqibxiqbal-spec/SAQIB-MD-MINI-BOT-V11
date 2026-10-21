process.env.SESSION_DIR = process.env.SESSION_DIR || './.test-session';
const fs = require('fs');
process.exit = () => {};
require('../config');
require('../lib/settings').load();
require('../lib/bans').load();
const registry = require('../plugins/_registry');
const path = require('path');
const plugins = [];
for (const f of fs.readdirSync(path.join(__dirname, '..', 'plugins')).filter((x) => x.endsWith('.js') && !x.startsWith('_'))) {
  const plug = require(path.join(__dirname, '..', 'plugins', f));
  if (Array.isArray(plug.commands) && typeof plug.handler === 'function') plugins.push({ file: f, ...plug });
}
registry.set(plugins);
const sock = { user: { id: '923106762478:1@s.whatsapp.net' }, sendMessage: async () => ({ key: { id: 'SENT' } }), readMessages: async () => {}, sendPresenceUpdate: async () => {}, profilePictureUrl: async () => '', groupMetadata: async () => ({ subject: 'G', participants: [], creation: 1, owner: 'x', desc: '' }) };
(async () => {
  const out = [];
  const m = { key: { remoteJid: '123@g.us', id: 'X1', participant: '923106762478@s.whatsapp.net' }, message: { conversation: '.gpt 2+2 kitna hota hai? sirf number batao' }, pushName: 'T' };
  const ctx = { sock, m, from: '123@g.us', isGroup: true, sender: '923106762478@s.whatsapp.net', senderNum: '923106762478', pushname: 'T', text: '.gpt 2+2', command: 'gpt', args: ['2+2'], arg: '2+2 kitna hota hai? sirf number batao', quoted: null, isOwner: true, reply: async (t) => out.push(String(t)), sendSticker: async () => {}, send: async (j, c) => { out.push(JSON.stringify(c).slice(0, 200)); return { key: { id: 'S' } }; }, react: async () => {} };
  const p = plugins.find((x) => x.file === 'ai.js');
  await p.handler(ctx);
  console.log('GPT REPLY:', out.join(' | ').slice(0, 300));
  process.exit(0);
})();
