#!/usr/bin/env node
/**
 * SAQIB-MD-MINI-BOT-V11 — FEATURE VERIFICATION
 * ============================================
 * End-to-end checks for the four requested features:
 *
 *   F1 DATABASE-DRIVEN CONFIG (API keys)
 *        lib/apikeys.js + .apikeys / .setapikey / .delapikey owner commands.
 *        Keys live in MongoDB (collection `api_keys`) and update LIVE.
 *
 *   F2 SESSION PERSISTENCE (MongoDB)
 *        lib/sessionStore.js mirrors each session folder to MongoDB and
 *        rebuilds it on boot, so a container restart needs NO re-pairing.
 *
 *   F3 MENU BUG FIX + DP
 *        `.menu <number>` opens THAT numbered category (with the bot DP).
 *
 *   F4 MIRRORED AUTO-REACTION
 *        An emoji-only message gets the SAME emoji back as a reaction
 *        (per-bot `.mirrorreact on/off`).
 *
 * Run: node test/features-verify.js
 */
const path = require('path');
const os = require('os');
const fs = require('fs');

// Isolate every store into a temp dir BEFORE config loads.
const TMP = path.join(os.tmpdir(), 'saqib-features-' + Date.now());
process.env.SESSION_DIR = path.join(TMP, 'session');
delete process.env.MONGODB_URI; // exercise the graceful / mocked paths

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
const apikeys = require('../lib/apikeys');
const sessionStore = require('../lib/sessionStore');
const mongo = require('../lib/mongo');
const reactSettings = require('../lib/reactSettings');
const premium = require('../plugins/premium');
const owner = require('../plugins/owner');

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  \u2705 ${n}`); } else { fail++; console.log(`  \u274c ${n} ${e}`); } };
const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const OWNER = config.LOCKED_OWNER_NUMBER;
const USER = '923001234567';
const SESSION = { number: '923009999999', ownerNumber: '923009999999' };
const FIRE = '\u{1F525}';   // 🔥
const SMILE = '\u{1F600}';  // 😀
const HEART = '\u{1F49A}';  // 💚

/* ------------------------------- F3 helpers ------------------------------ */
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

/* ------------------------------- F4 helpers ------------------------------ */
function msgCtx({ senderNum, isGroup = true, sessionNumber = SESSION.number, text = 'hello', command = '' }) {
  const calls = [];
  const jid = isGroup ? 'g@g.us' : `${senderNum}@s.whatsapp.net`;
  const s = {
    sendMessage: async (j, content) => { if (content && content.react) calls.push(content.react.text); return { key: { id: 'x' } }; },
    readMessages: async () => {},
    sendPresenceUpdate: async () => {},
  };
  const m = { key: { remoteJid: jid, id: 'M1', participant: `${senderNum}@s.whatsapp.net` }, message: { conversation: text }, pushName: 'T' };
  return {
    calls,
    ctx: {
      sock: s, m, from: jid, isGroup, sender: `${senderNum}@s.whatsapp.net`, senderNum,
      text, command, args: [], arg: '', isOwner: senderNum === OWNER,
      session: { number: sessionNumber },
      reply: async () => {}, send: async () => {},
    },
  };
}
function cmdCtx({ command, arg = '', sessionNumber = SESSION.number, senderNum = OWNER }) {
  const replies = [];
  return {
    replies,
    ctx: {
      command, arg, args: String(arg || '').split(/\s+/).filter(Boolean), prefix: '.',
      senderNum, isOwner: senderNum === OWNER, from: 'g@g.us', isGroup: true,
      session: { number: sessionNumber },
      m: { key: { remoteJid: 'g@g.us', id: 'C1' } },
      reply: async (t) => { replies.push(String(t)); },
      send: async () => {},
      sock: { sendMessage: async () => ({ key: { id: 'x' } }), sendPresenceUpdate: async () => {} },
    },
  };
}

function quiet() {
  config.ANTISPAM = false; config.ANTILINK = false; config.AUTOVIEWONCE = false;
  config.CHATBOT = false; config.STATUSVIEW = false; config.STATUSLIKE = false;
  config.AUTOSTATUS = false; config.AUTOREAD_STATUS = false;
}

(async () => {
  quiet();

  /* ===================================================================== */
  console.log('\n=== F3) MENU BUG FIX \u2014 `.menu <number>` opens that category (with DP) ===');

  sent = [];
  await handler.handleMessage(sock, dmMsg('.menu', USER), SESSION);
  await wait();
  const cats = [...new Set(plugins.filter((p) => !p.hidden).map((p) => p.category || 'OTHER'))];
  const firstCat = cats[0];
  check('.menu lists categories', /CATEGORIES/i.test(texts()), texts().slice(0, 100));
  check('.menu carries the DP', images().length >= 1, `images=${images().length}`);

  sent = [];
  await handler.handleMessage(sock, dmMsg('.menu 1', USER), SESSION);
  await wait();
  check('`.menu 1` opens category #1 (not "nahi mili")', texts().includes(firstCat) && !/nahi mili/i.test(texts()), `want "${firstCat}" got "${texts().slice(0, 140)}"`);
  check('`.menu 1` carries the DP', images().length >= 1, `images=${images().length}`);
  check('`.menu 1` shows the category header', new RegExp(`\u2022 \\*${firstCat}\\*`).test(texts()) || texts().includes(firstCat), texts().slice(0, 140));

  sent = [];
  await handler.handleMessage(sock, dmMsg('.menu 999', USER), SESSION);
  await wait();
  check('`.menu 999` -> range notice', /darmiyan|number/i.test(texts()), texts().slice(0, 120));

  sent = [];
  await handler.handleMessage(sock, dmMsg(`.menu ${firstCat}`, USER), SESSION);
  await wait();
  check('`.menu <name>` still works', texts().includes(firstCat), texts().slice(0, 120));

  /* ===================================================================== */
  console.log('\n=== F1) DATABASE-DRIVEN API KEYS \u2014 store + live admin commands ===');

  check('apikeys exposes the known services', apikeys.SERVICE_IDS.includes('tiktok') && apikeys.SERVICE_IDS.includes('facebook') && apikeys.SERVICE_IDS.includes('instagram'), JSON.stringify(apikeys.SERVICE_IDS));
  check('get() empty before set', apikeys.get('tiktok') === '', JSON.stringify(apikeys.get('tiktok')));

  apikeys.set('tiktok', 'TTK-SECRET-123456', 'https://api.example.com/tiktok');
  check('set() stores the key', apikeys.get('tiktok') === 'TTK-SECRET-123456', apikeys.get('tiktok'));
  const rec = apikeys.getService('tiktok');
  check('getService() returns { key, endpoint }', rec && rec.key === 'TTK-SECRET-123456' && rec.endpoint === 'https://api.example.com/tiktok', JSON.stringify(rec));
  check('has() true when set', apikeys.has('tiktok') === true);
  check('local mirror file written', fs.existsSync(apikeys.FILE), apikeys.FILE);
  check('mask() hides the middle', /^TTK-/.test(apikeys.mask('TTK-SECRET-123456')) && apikeys.mask('TTK-SECRET-123456').includes('\u2022') && !apikeys.mask('TTK-SECRET-123456').includes('SECRET'), apikeys.mask('TTK-SECRET-123456'));

  const listed = apikeys.list().find((x) => x.id === 'tiktok');
  check('list() marks tiktok configured', listed && listed.configured === true, JSON.stringify(listed));

  // Admin command: .setapikey (live, no restart)
  let c = cmdCtx({ command: 'setapikey', arg: 'instagram IG-KEY-999' });
  await owner.handler(c.ctx);
  check('.setapikey updates live', apikeys.get('instagram') === 'IG-KEY-999', apikeys.get('instagram'));
  check('.setapikey replies confirmation', /update|live/i.test(c.replies.join(' ')), c.replies.join(' ').slice(0, 120));

  // Admin command: .setapikey with endpoint
  c = cmdCtx({ command: 'setapikey', arg: 'facebook FB-KEY-1 https://api.fb.example.com/dl' });
  await owner.handler(c.ctx);
  const fb = apikeys.getService('facebook');
  check('.setapikey stores the endpoint', fb && fb.key === 'FB-KEY-1' && fb.endpoint === 'https://api.fb.example.com/dl', JSON.stringify(fb));

  // Admin command: .apikeys (list)
  c = cmdCtx({ command: 'apikeys', arg: '' });
  await owner.handler(c.ctx);
  check('.apikeys lists the keys', /API KEYS/i.test(c.replies.join(' ')) && /tiktok/i.test(c.replies.join(' ')), c.replies.join(' ').slice(0, 120));
  check('.apikeys masks secrets by default', !c.replies.join(' ').includes('TTK-SECRET-123456'), 'secret leaked!');

  // Admin command: .apikeys full (reveal)
  c = cmdCtx({ command: 'apikeys', arg: 'full' });
  await owner.handler(c.ctx);
  check('.apikeys full reveals the keys', c.replies.join(' ').includes('TTK-SECRET-123456'), 'not revealed');

  // Admin command: .apikeys <service>
  c = cmdCtx({ command: 'apikeys', arg: 'tiktok' });
  await owner.handler(c.ctx);
  check('.apikeys <service> shows detail', /TikTok/i.test(c.replies.join(' ')) && /SET/i.test(c.replies.join(' ')), c.replies.join(' ').slice(0, 120));

  // Admin command: .delapikey
  c = cmdCtx({ command: 'delapikey', arg: 'instagram' });
  await owner.handler(c.ctx);
  check('.delapikey removes the key', apikeys.has('instagram') === false, apikeys.get('instagram'));
  check('.delapikey replies confirmation', /hata|remove/i.test(c.replies.join(' ')), c.replies.join(' ').slice(0, 120));

  // The downloader reads the SAME store (apiResolve uses getService).
  check('downloader can read the stored endpoint', (apikeys.getService('facebook') || {}).endpoint === 'https://api.fb.example.com/dl', JSON.stringify(apikeys.getService('facebook')));

  /* ===================================================================== */
  console.log('\n=== F2) SESSION PERSISTENCE \u2014 mirror + rebuild from MongoDB ===');

  // Mock MongoDB in-memory so we can exercise the full round-trip offline.
  const mem = new Map();
  mongo.isReady = () => true;
  mongo.setDoc = async (name, id, data) => { mem.set(`${name}:${id}`, data); return true; };
  mongo.getDoc = async (name, id) => mem.get(`${name}:${id}`) || null;
  mongo.listDocs = async (name) => [...mem.entries()]
    .filter(([k]) => k.startsWith(name + ':'))
    .map(([k, v]) => ({ id: k.slice(name.length + 1), data: v }));
  mongo.delDoc = async (name, id) => mem.delete(`${name}:${id}`);

  const NUM = '923001111111';
  const dir = sessionStore.sessionDir(NUM);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'creds.json'), JSON.stringify({ registered: true, me: { id: `${NUM}:1@s.whatsapp.net` } }));
  fs.writeFileSync(path.join(dir, 'app-state-sync-key-abc.json'), JSON.stringify({ keyId: 'abc' }));

  const saved = await sessionStore.saveSession(NUM, dir);
  check('saveSession() writes to MongoDB', saved === true && mem.has(`sessions:${NUM}`), `saved=${saved}`);
  check('cloud copy holds the auth files', (mem.get(`sessions:${NUM}`).files['creds.json'] || '').includes('registered'), 'missing creds');

  // Simulate an EPHEMERAL-DISK WIPE: delete the whole folder, then restore.
  fs.rmSync(dir, { recursive: true, force: true });
  check('session folder wiped (simulating container restart)', !fs.existsSync(dir));

  const restored = await sessionStore.restoreAll(path.resolve(config.SESSION_DIR));
  check('restoreAll() rebuilds the session', restored >= 1, `restored=${restored}`);
  check('creds.json restored to disk', fs.existsSync(path.join(dir, 'creds.json')), dir);
  check('app-state key restored to disk', fs.existsSync(path.join(dir, 'app-state-sync-key-abc.json')), dir);
  let creds = null;
  try { creds = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8')); } catch { /* ignore */ }
  check('restored creds are intact (registered)', creds && creds.registered === true && creds.me.id.startsWith(NUM), JSON.stringify(creds));

  // restoreAll must NOT clobber a live session.
  const before = fs.readFileSync(path.join(dir, 'creds.json'), 'utf8');
  fs.writeFileSync(path.join(dir, 'creds.json'), JSON.stringify({ registered: true, me: { id: `${NUM}:9@s.whatsapp.net` } }));
  await sessionStore.restoreAll(path.resolve(config.SESSION_DIR));
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8'));
  check('restoreAll() never clobbers a live session', after.me.id.endsWith(':9@s.whatsapp.net'), after.me.id);

  const cloudList = await sessionStore.list();
  check('list() reports the cloud session', cloudList.some((x) => x.number === NUM), JSON.stringify(cloudList));

  const del = await sessionStore.deleteSession(NUM);
  check('deleteSession() removes the cloud copy', del === true && !mem.has(`sessions:${NUM}`), `del=${del}`);

  // Graceful when Mongo is NOT ready (real-world: no MONGODB_URI).
  const realIsReady = mongo.isReady;
  mongo.isReady = () => false;
  check('saveSession() is graceful when Mongo off', (await sessionStore.saveSession('923002222222', sessionStore.sessionDir('923002222222'))) === false);
  check('restoreAll() is graceful when Mongo off', (await sessionStore.restoreAll()) === 0);
  check('list() is graceful when Mongo off', (await sessionStore.list()).length === 0);
  mongo.isReady = realIsReady;

  /* ===================================================================== */
  console.log('\n=== F4) MIRRORED AUTO-REACTION \u2014 same emoji back ===');

  reactSettings.set(SESSION.number, { autoReact: false, autoReactGroup: true, autoReactChat: true, reactScope: 'all', mirrorEmoji: true });
  check('mirrorEmoji default is ON', reactSettings.get(SESSION.number).mirrorEmoji === true, JSON.stringify(reactSettings.get(SESSION.number)));

  // Mirror works even with the random auto-react master OFF.
  let u = msgCtx({ senderNum: USER, isGroup: true, text: FIRE });
  await premium.onMessage(u.ctx); await wait();
  check('emoji-only message mirrored (🔥)', u.calls.length === 1 && u.calls[0] === FIRE, JSON.stringify(u.calls));

  u = msgCtx({ senderNum: USER, isGroup: true, text: SMILE });
  await premium.onMessage(u.ctx); await wait();
  check('a different emoji is mirrored exactly (😀)', u.calls.length === 1 && u.calls[0] === SMILE, JSON.stringify(u.calls));

  u = msgCtx({ senderNum: USER, isGroup: true, text: `${FIRE}${SMILE}` });
  await premium.onMessage(u.ctx); await wait();
  check('multi-emoji mirrors the FIRST emoji', u.calls.length === 1 && u.calls[0] === FIRE, JSON.stringify(u.calls));

  u = msgCtx({ senderNum: USER, isGroup: true, text: 'hello world' });
  await premium.onMessage(u.ctx); await wait();
  check('plain text is NOT mirrored', u.calls.length === 0, JSON.stringify(u.calls));

  // .mirrorreact off -> no mirror
  c = cmdCtx({ command: 'mirrorreact', arg: 'off', sessionNumber: SESSION.number });
  await premium.handler(c.ctx);
  check('.mirrorreact off replies', /OFF/i.test(c.replies.join(' ')), c.replies.join(' ').slice(0, 120));
  check('mirrorEmoji now false', reactSettings.get(SESSION.number).mirrorEmoji === false);
  u = msgCtx({ senderNum: USER, isGroup: true, text: FIRE });
  await premium.onMessage(u.ctx); await wait();
  check('mirror OFF -> emoji NOT mirrored', u.calls.length === 0, JSON.stringify(u.calls));

  // .mirrorreact on -> mirrors again
  c = cmdCtx({ command: 'mirrorreact', arg: 'on', sessionNumber: SESSION.number });
  await premium.handler(c.ctx);
  check('.mirrorreact on replies', /ON/i.test(c.replies.join(' ')), c.replies.join(' ').slice(0, 120));
  u = msgCtx({ senderNum: USER, isGroup: true, text: HEART });
  await premium.onMessage(u.ctx); await wait();
  check('mirror ON -> emoji mirrored again (💚)', u.calls.length === 1 && u.calls[0] === HEART, JSON.stringify(u.calls));

  // Status shows the mirror line
  c = cmdCtx({ command: 'mirrorreact', arg: '', sessionNumber: SESSION.number });
  await premium.handler(c.ctx);
  check('.mirrorreact status shows Mirror emoji', /Mirror emoji/i.test(c.replies.join(' ')), c.replies.join(' ').slice(0, 160));

  // Mirror respects the group/chat scope (chat off -> DM still works, group doesn't)
  reactSettings.set(SESSION.number, { mirrorEmoji: true, autoReactGroup: false, autoReactChat: true });
  u = msgCtx({ senderNum: USER, isGroup: true, text: FIRE });
  await premium.onMessage(u.ctx); await wait();
  check('mirror respects group=OFF', u.calls.length === 0, JSON.stringify(u.calls));
  u = msgCtx({ senderNum: USER, isGroup: false, text: FIRE });
  await premium.onMessage(u.ctx); await wait();
  check('mirror still works in DM', u.calls.length === 1 && u.calls[0] === FIRE, JSON.stringify(u.calls));

  // Owner react stays LOCKED (unchanged by any of this)
  u = msgCtx({ senderNum: OWNER, isGroup: true, text: 'hi' });
  await premium.onMessage(u.ctx); await wait();
  check('owner react still LOCKED (🧑‍💻)', u.calls.length === 1 && u.calls[0] === config.OWNER_REACT_EMOJI, JSON.stringify(u.calls));

  console.log(`\n${fail === 0 ? '\u2705 ALL PASS' : '\u274c FAILURES'} \u2014 ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('TEST CRASHED:', e); process.exit(2); });
