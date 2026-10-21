#!/usr/bin/env node
/**
 * Integration test — numbered menu replies + DP + MongoDB persistence + the
 * "how many bots are active" command, through the FULL handleMessage pipeline.
 *
 *   .menu            -> categories menu WITH the bot DP (image)
 *   "1" (bare)       -> opens category #1's menu (WITH the DP) for THIS session
 *   "999" (bare)     -> "1 se N ke darmiyan" notice
 *   .menuall         -> every command, WITH the DP
 *   .bots            -> active-bot summary (owner only)
 *   mongo            -> graceful no-op when MONGODB_URI is unset
 *
 * Run: node test/menu-mongo-bots-verify.js
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.SESSION_DIR = path.join(os.tmpdir(), 'saqib-menu-mongo-' + Date.now(), 'session');
delete process.env.MONGODB_URI; // exercise the "not configured" path

const config = require('../config');
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

const handler = require('../lib/handler');
const menuReply = require('../lib/menuReply');
const mongo = require('../lib/mongo');
const settings = require('../lib/settings');

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  \u2705 ${n}`); } else { fail++; console.log(`  \u274c ${n} ${e}`); } };
const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const OWNER = config.LOCKED_OWNER_NUMBER;
const USER = '923001234567';
const SESSION = { number: '923009999999', ownerNumber: '923009999999' };
const SESSION_B = { number: '923008888888', ownerNumber: '923008888888' };

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
const images = () => sent.filter((s) => s.content && Buffer.isBuffer(s.content.image));
const dmMsg = (text, sender) => ({
  key: { remoteJid: `${sender}@s.whatsapp.net`, id: 'M' + Math.random().toString(36).slice(2), fromMe: false },
  message: { conversation: text }, pushName: 'T',
});
const groupMsg = (text, participant) => ({
  key: { remoteJid: '123@g.us', id: 'M' + Math.random().toString(36).slice(2), participant, fromMe: false },
  message: { conversation: text }, pushName: 'T',
});

(async () => {
  config.ANTISPAM = false; config.ANTILINK = false; config.AUTOVIEWONCE = false;
  config.CHATBOT = false; config.STATUSVIEW = false; config.STATUSLIKE = false;

  console.log('\n1) .menu shows the categories menu WITH the bot DP');
  sent = [];
  await handler.handleMessage(sock, dmMsg('.menu', USER), SESSION);
  await wait();
  const catsOut = texts();
  check('categories menu replied', /CATEGORIES/i.test(catsOut), catsOut.slice(0, 120));
  check('menu carried the DP (image)', images().length >= 1, `images=${images().length}`);
  check('menu shows numbered rows (01, 02\u2026)', /01/.test(catsOut) && /02/.test(catsOut), catsOut.slice(0, 160));

  console.log('\n2) bare "1" opens category #1 (WITH the DP) for THIS session');
  const cats = [...new Set(plugins.filter((p) => !p.hidden).map((p) => p.category || 'OTHER'))];
  const firstCat = cats[0];
  sent = [];
  await handler.handleMessage(sock, dmMsg('1', USER), SESSION);
  await wait();
  check('category #1 menu replied', texts().includes(firstCat), `want "${firstCat}" got "${texts().slice(0, 120)}"`);
  check('category menu carried the DP (image)', images().length >= 1, `images=${images().length}`);

  console.log('\n3) menuReply is PER-SESSION (no cross-bot collision)');
  menuReply.arm(USER, SESSION.number, ['AI', 'FUN']);
  const other = menuReply.consume(USER, SESSION_B.number, '1');
  check('a different session does NOT consume the pick', other === null, JSON.stringify(other));
  const mine = menuReply.consume(USER, SESSION.number, '1');
  check('the owning session DOES consume the pick', mine && mine.cat === 'AI', JSON.stringify(mine));

  console.log('\n4) out-of-range number -> notice');
  sent = [];
  await handler.handleMessage(sock, dmMsg('.menu', USER), SESSION);
  await wait();
  sent = [];
  await handler.handleMessage(sock, dmMsg('999', USER), SESSION);
  await wait();
  check('out-of-range replied with a range notice', /darmiyan|number/i.test(texts()), texts().slice(0, 120));

  console.log('\n5) .menuall carries the DP too');
  sent = [];
  await handler.handleMessage(sock, dmMsg('.menuall', USER), SESSION);
  await wait();
  check('.menuall replied', texts().length > 0, 'empty');
  check('.menuall carried the DP (image)', images().length >= 1, `images=${images().length}`);

  console.log('\n6) .bots — active-bot summary (owner only)');
  sent = [];
  await handler.handleMessage(sock, groupMsg('.bots', `${OWNER}@s.whatsapp.net`), SESSION);
  await wait();
  check('.bots replied with the summary', /Active Bots/i.test(texts()), texts().slice(0, 120));
  check('.bots shows the session count', /Total sessions/i.test(texts()), texts().slice(0, 160));
  // A non-owner must NOT get the summary.
  sent = [];
  await handler.handleMessage(sock, groupMsg('.bots', `${USER}@s.whatsapp.net`), SESSION);
  await wait();
  check('non-owner is blocked from .bots', !/Active Bots/i.test(texts()), texts().slice(0, 120));

  console.log('\n7) MongoDB — configured by default, graceful before connect()');
  check('config.MONGODB_URI is set (owner cluster)', /^mongodb\+srv:\/\//.test(String(config.MONGODB_URI)), String(config.MONGODB_URI).slice(0, 24) + '\u2026');
  check('config.MONGODB_DB defaults to saqib_md', config.MONGODB_DB === 'saqib_md', String(config.MONGODB_DB));
  check('mongo.enabled() is true', mongo.enabled() === true);
  check('mongo.isReady() is false before init()', mongo.isReady() === false);
  check('getDoc() is null before connect', (await mongo.getDoc('settings')) === null);
  check('setDoc() is false before connect', (await mongo.setDoc('settings', 'global', {})) === false);
  check('settings.loadMongo() is false before connect', (await settings.loadMongo()) === false);
  let saveThrew = false;
  try { settings.save(); } catch { saveThrew = true; }
  check('settings.save() does not throw when mongo not ready', saveThrew === false);
  check('settings file written locally', fs.existsSync(settings.FILE), settings.FILE);

  console.log('\n8) MongoDB — disabled path (empty URI) stays graceful');
  const savedUri = config.MONGODB_URI;
  config.MONGODB_URI = '';
  check('mongo.enabled() is false when URI is empty', mongo.enabled() === false);
  check('settings.loadMongo() returns false when disabled', (await settings.loadMongo()) === false);
  config.MONGODB_URI = savedUri;

  console.log(`\n${fail === 0 ? '\u2705 ALL PASS' : '\u274c FAILURES'} \u2014 ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
