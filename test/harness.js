/**
 * SAQIB MD — offline command test harness
 * ---------------------------------------
 * Loads every plugin and invokes each command handler with a mocked socket +
 * context. Catches synchronous errors, missing references and typos.
 * Network calls are allowed to time out (that's fine — we only care about
 * crashes). Run: node test/harness.js
 */
process.env.SESSION_DIR = process.env.SESSION_DIR || './.test-session';
const path = require('path');
const fs = require('fs');

// Block process.exit so commands like .restart don't kill the harness.
const realExit = process.exit.bind(process);
let exitCode = 0;
process.exit = (code) => { exitCode = code || 0; };

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
  readMessages: async () => {},
  sendPresenceUpdate: async () => {},
  profilePictureUrl: async () => 'https://example.com/p.jpg',
  groupMetadata: async () => ({ subject: 'G', participants: [{ id: '923106762478@s.whatsapp.net', admin: 'admin' }], creation: 1600000000, owner: '923106762478@s.whatsapp.net', desc: 'test' }),
  groupParticipantsUpdate: async () => {},
  groupSettingUpdate: async () => {},
  groupInviteCode: async () => 'CODE123',
  groupRevokeInvite: async () => {},
  groupUpdateSubject: async () => {},
  groupUpdateDescription: async () => {},
  updateBlockStatus: async () => {},
  fetchStatus: async () => [{ status: 'hi' }],
  updateProfileStatus: async () => {},
  updateProfileName: async () => {},
  updateProfilePicture: async () => {},
  requestPairingCode: async () => 'ABCD1234',
  groupFetchAllParticipating: async () => ({}),
  fetchBlocklist: async () => [],
  copyNForward: async () => {},
  groupLeave: async () => {},
};

function makeCtx(command, arg = '') {
  const m = {
    key: { remoteJid: '123@g.us', id: 'MSGID', participant: '923106762478@s.whatsapp.net' },
    message: { conversation: '.' + command + (arg ? ' ' + arg : '') },
    pushName: 'Tester',
  };
  return {
    sock, m, from: '123@g.us', isGroup: true,
    sender: '923106762478@s.whatsapp.net', senderNum: '923106762478', pushname: 'Tester',
    text: '.' + command + (arg ? ' ' + arg : ''), command,
    args: arg ? arg.split(' ') : [], arg,
    quoted: null, isOwner: true,
    reply: async () => {},
    sendSticker: async () => {},
    send: async () => ({ key: { id: 'SENT' } }),
    react: async () => {},
  };
}

const withTimeout = (p, ms) => Promise.race([
  Promise.resolve(p).then(() => 'ok').catch((e) => 'ERR: ' + (e && e.message ? e.message : e)),
  new Promise((r) => setTimeout(() => r('timeout'), ms)),
]);

// Commands that intentionally hit slow networks — give them a short window.
const NET = new Set(['song', 'play', 'music', 'ytaudio', 'ytmp3', 'ytmp4', 'ytvideo', 'video', 'apk', 'tts', 'ttsearch', 'tiktoksearch', 'tiktok', 'tt', 'ttmp3', 'instagram', 'ig', 'igdl', 'reels', 'facebook', 'fb', 'twitter', 'x', 'pinterest', 'pin', 'ss', 'carbon', 'tourl', 'imagine', 'image', 'img', 'logo', 'emojimix', 'news', 'weather', 'wiki', 'currency', 'exchange', 'fx', 'ip', 'quote2', 'joke2', 'define', 'githubstalk', 'praytime', 'getpp', 'say', 'speak', 'voice']);

(async () => {
  let errors = 0, ok = 0, timeouts = 0;
  const all = [];
  for (const p of plugins) for (const c of p.commands) all.push({ c, p });

  for (const { c, p } of all) {
    const arg = '';
    const res = await withTimeout(p.handler(makeCtx(c, arg)), NET.has(c) ? 6000 : 4000);
    if (res === 'ok') ok++;
    else if (res === 'timeout') timeouts++;
    else { errors++; console.log(`❌ [${p.file}] .${c} -> ${res}`); }
  }

  console.log(`\n=== RESULT ===`);
  console.log(`commands: ${all.length} | ok: ${ok} | timeout(net): ${timeouts} | errors: ${errors}`);
  realExit(errors ? 1 : 0);
})();
