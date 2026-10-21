#!/usr/bin/env node
/**
 * Integration test — the react menu + locked owner react through the FULL
 * handleMessage pipeline (buildContext -> hooks -> handler).
 *
 *   .autoreact            -> numbered menu reply
 *   "1" (bare)            -> applies Auto React to THIS bot only
 *   .ownerreact off       -> LOCKED notice, owner react still fires
 *   owner message         -> always reacted with 🧑‍💻 (group + DM)
 *
 * Run: node test/react-menu-integration.js
 */
const path = require('path');
const os = require('os');
process.env.SESSION_DIR = path.join(os.tmpdir(), 'saqib-menu-int-' + Date.now(), 'session');

const config = require('../config');
require('../lib/settings').load();
require('../lib/bans').load();

const registry = require('../plugins/_registry');
const fs = require('fs');
const pluginsDir = path.join(__dirname, '..', 'plugins');
const plugins = [];
for (const f of fs.readdirSync(pluginsDir).filter((x) => x.endsWith('.js') && !x.startsWith('_'))) {
  const plug = require(path.join(pluginsDir, f));
  if (Array.isArray(plug.commands) && typeof plug.handler === 'function') plugins.push({ file: f, ...plug });
}
registry.set(plugins);

const handler = require('../lib/handler');
const reactSettings = require('../lib/reactSettings');

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  \u2705 ${n}`); } else { fail++; console.log(`  \u274c ${n} ${e}`); } };
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const DEV = '\u{1F9D1}\u200D\u{1F4BB}';
const OWNER = config.LOCKED_OWNER_NUMBER;
const USER = '923001234567';
const SESSION = { number: '923009999999', ownerNumber: '923009999999' };

let sent = [];
const sock = {
  user: { id: `${SESSION.number}:1@s.whatsapp.net` },
  sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'SENT' } }; },
  readMessages: async () => {},
  sendPresenceUpdate: async () => {},
  groupMetadata: async () => ({ subject: 'G', participants: [], creation: 1600000000, owner: `${OWNER}@s.whatsapp.net`, desc: '' }),
  groupParticipantsUpdate: async () => {},
  groupSettingUpdate: async () => {},
  groupInviteCode: async () => 'CODE',
  groupFetchAllParticipating: async () => ({}),
  fetchBlocklist: async () => [],
};
const texts = () => sent.map((s) => (s.content && (s.content.text || s.content.caption)) || '').join(' | ');
const reacts = () => sent.filter((s) => s.content && s.content.react).map((s) => s.content.react.text);

const groupMsg = (text, participant) => ({
  key: { remoteJid: '123@g.us', id: 'M' + Math.random().toString(36).slice(2), participant, fromMe: false },
  message: { conversation: text }, pushName: 'T',
});
const dmMsg = (text, sender) => ({
  key: { remoteJid: `${sender}@s.whatsapp.net`, id: 'M' + Math.random().toString(36).slice(2), fromMe: false },
  message: { conversation: text }, pushName: 'T',
});

(async () => {
  config.ANTISPAM = false; config.ANTILINK = false; config.AUTOVIEWONCE = false;
  config.CHATBOT = false; config.STATUSVIEW = false; config.STATUSLIKE = false;
  reactSettings.set(SESSION.number, { autoReact: false, autoReactGroup: true, autoReactChat: true, reactScope: 'all' });

  console.log('\n1) .autoreact shows the numbered menu (full pipeline)');
  sent = [];
  await handler.handleMessage(sock, groupMsg('.autoreact', `${USER}@s.whatsapp.net`), SESSION);
  await wait();
  const menuOut = texts();
  check('menu reply contains 1/2/3', /1/.test(menuOut) && /2/.test(menuOut) && /3/.test(menuOut), menuOut.slice(0, 160));

  console.log('\n2) bare "1" applies Auto React to THIS bot');
  sent = [];
  await handler.handleMessage(sock, dmMsg('1', USER), SESSION);
  await wait();
  check('session autoReact turned ON', reactSettings.get(SESSION.number).autoReact === true, JSON.stringify(reactSettings.get(SESSION.number)));
  check('confirmation replied', /Ho gaya/i.test(texts()), texts().slice(0, 120));

  console.log('\n3) owner is ALWAYS reacted (group + DM)');
  sent = [];
  await handler.handleMessage(sock, groupMsg('hello owner', `${OWNER}@s.whatsapp.net`), SESSION);
  await wait();
  check('owner reacted in GROUP with \ud83e\uddd1\u200d\ud83d\udcbb', reacts().includes(DEV), JSON.stringify(reacts()));
  sent = [];
  await handler.handleMessage(sock, dmMsg('hello owner', OWNER), SESSION);
  await wait();
  check('owner reacted in DM with \ud83e\uddd1\u200d\ud83d\udcbb', reacts().includes(DEV), JSON.stringify(reacts()));

  console.log('\n4) .ownerreact off is LOCKED');
  sent = [];
  await handler.handleMessage(sock, groupMsg('.ownerreact off', `${USER}@s.whatsapp.net`), SESSION);
  await wait();
  check('.ownerreact off replies LOCKED', /LOCKED/i.test(texts()), texts().slice(0, 120));
  sent = [];
  await handler.handleMessage(sock, groupMsg('still here', `${OWNER}@s.whatsapp.net`), SESSION);
  await wait();
  check('owner STILL reacted after .ownerreact off', reacts().includes(DEV), JSON.stringify(reacts()));

  console.log(`\n${fail === 0 ? '\u2705 ALL PASS' : '\u274c FAILURES'} \u2014 ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
