/**
 * SAQIB MD — live smoke test for key features (network allowed).
 * Run: node test/live.js
 */
process.env.SESSION_DIR = process.env.SESSION_DIR || './.test-session';
const path = require('path');
const fs = require('fs');
require('../config');
require('../lib/settings').load();
require('../lib/bans').load();

const registry = require('../plugins/_registry');
const pluginsDir = path.join(__dirname, '..', 'plugins');
const plugins = [];
for (const f of fs.readdirSync(pluginsDir).filter((x) => x.endsWith('.js') && !x.startsWith('_'))) {
  const plug = require(path.join(pluginsDir, f));
  if (Array.isArray(plug.commands) && typeof plug.handler === 'function') plugins.push({ file: f, ...plug });
}
registry.set(plugins);

const sock = {
  user: { id: '923106762478:1@s.whatsapp.net' },
  sendMessage: async () => ({ key: { id: 'SENT' } }),
  readMessages: async () => {}, sendPresenceUpdate: async () => {},
  profilePictureUrl: async () => 'https://example.com/p.jpg',
  groupMetadata: async () => ({ subject: 'G', participants: [], creation: 1600000000, owner: 'x@s.whatsapp.net', desc: '' }),
  updateBlockStatus: async () => {}, fetchStatus: async () => [{ status: 'hi' }],
  requestPairingCode: async () => 'ABCD1234', groupFetchAllParticipating: async () => ({}),
  fetchBlocklist: async () => [], copyNForward: async () => {}, groupLeave: async () => {},
};

function makeCtx(command, arg = '') {
  const out = [];
  const m = { key: { remoteJid: '123@g.us', id: 'MSGID', participant: '923106762478@s.whatsapp.net' }, message: { conversation: '.' + command + (arg ? ' ' + arg : '') }, pushName: 'Tester' };
  return {
    sock, m, from: '123@g.us', isGroup: true, sender: '923106762478@s.whatsapp.net', senderNum: '923106762478', pushname: 'Tester',
    text: '.' + command + (arg ? ' ' + arg : ''), command, args: arg ? arg.split(' ') : [], arg, quoted: null, isOwner: true,
    reply: async (t) => { out.push(String(t)); },
    sendSticker: async () => {}, send: async (jid, c) => { out.push('[MEDIA] ' + JSON.stringify(c).slice(0, 120)); return { key: { id: 'SENT' } }; },
    react: async () => {}, _out: out,
  };
}
const run = async (cmd, arg, plugFile) => {
  const p = plugins.find((x) => x.file === plugFile);
  const ctx = makeCtx(cmd, arg);
  await p.handler(ctx);
  return ctx._out.join('\n');
};

(async () => {
  const show = (t, s) => console.log(`\n########## ${t} ##########\n${String(s).slice(0, 900)}`);

  show('.menu', await run('menu', '', 'main.js'));
  show('.menu fun', await run('menu', 'fun', 'main.js'));
  show('.menu download', await run('menu', 'download', 'main.js'));
  show('.menuall (head)', await run('menuall', '', 'main.js'));
  show('.currency 100 USD PKR', await run('currency', '100 USD PKR', 'tools.js'));
  show('.tts sad songs saraiki', await run('tts', 'sad songs saraiki', 'downloader.js'));
  show('.apk whatsapp', await run('apk', 'whatsapp', 'downloader.js'));

  // GIF conversion test
  try {
    const anime = require('../plugins/anime.js');
    const { getJSON } = require('../lib/helpers');
    const r = await getJSON('https://nekos.best/api/v2/kiss');
    const url = r.results[0].url;
    console.log('\n########## GIF url ##########\n' + url);
  } catch (e) { console.log('gif test err', e.message); }

  process.exit(0);
})();
