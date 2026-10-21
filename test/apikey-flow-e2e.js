#!/usr/bin/env node
/**
 * END-TO-END test of the interactive `.apikey` flow through the REAL dispatcher
 * (lib/handler.handleMessage) — not just the pieces in isolation:
 *
 *   owner: .apikey            -> bot sends the numbered menu
 *   owner: 2                  -> bot asks for the API key (captures prompt id)
 *   owner: <reply> KEY url    -> bot stores the key LIVE for `instagram`
 *   owner: .apikey 1 <key>    -> one-liner set for `tiktok`
 *
 * Run: node test/apikey-flow-e2e.js
 */
const path = require('path');
const os = require('os');
const fs = require('fs');

const TMP = path.join(os.tmpdir(), 'saqib-apikey-e2e-' + Date.now());
process.env.SESSION_DIR = path.join(TMP, 'session');
delete process.env.MONGODB_URI;

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

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${e}`); } };
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));

const OWNER = config.LOCKED_OWNER_NUMBER;   // 923106762478
const SESSION = { number: OWNER, ownerNumber: OWNER };
const DM = `${OWNER}@s.whatsapp.net`;

let sent = [];
let seq = 0;
let lastSentId = null;
const sock = {
  user: { id: `${OWNER}:1@s.whatsapp.net` },
  sendMessage: async (jid, content) => { sent.push({ jid, content }); lastSentId = 'MSG' + (++seq); return { key: { id: lastSentId } }; },
  readMessages: async () => {},
  sendPresenceUpdate: async () => {},
  groupMetadata: async () => ({ subject: 'G', participants: [], creation: 1600000000, owner: DM, desc: '' }),
  groupParticipantsUpdate: async () => {},
  groupSettingUpdate: async () => {},
  groupInviteCode: async () => 'CODE',
  groupFetchAllParticipating: async () => ({}),
  fetchBlocklist: async () => [],
};
const texts = () => sent.map((s) => (s.content && (s.content.text || s.content.caption)) || '').join(' | ');

const dm = (text) => ({
  key: { remoteJid: DM, id: 'M' + Math.random().toString(36).slice(2), fromMe: false },
  message: { conversation: text }, pushName: 'Owner',
});
const dmReply = (text, quotedId) => ({
  key: { remoteJid: DM, id: 'M' + Math.random().toString(36).slice(2), fromMe: false },
  message: { extendedTextMessage: { text, contextInfo: { stanzaId: quotedId, quotedMessage: { conversation: 'prompt' }, participant: DM } } },
  pushName: 'Owner',
});

// silence background hooks so they can't interfere
config.ANTISPAM = false; config.ANTILINK = false; config.CHATBOT = false;
config.STATUSVIEW = false; config.STATUSLIKE = false; config.AUTOSTATUS = false;
config.AUTOREAD_STATUS = false; config.AUTO_TYPING = false;

(async () => {
  console.log('\n=== INTERACTIVE .apikey FLOW (E2E via dispatcher) ===');
  ['tiktok', 'instagram', 'song', 'video', 'youtube'].forEach((s) => apikeys.remove(s));

  // 1) `.apikey` -> menu
  sent = [];
  await handler.handleMessage(sock, dm('.apikey'), SESSION);
  await wait();
  ok('.apikey sends the numbered menu', /Tiktok/i.test(texts()) && /Instagram/i.test(texts()) && /Song/i.test(texts()) && /Video/i.test(texts()), texts());

  // 2) owner replies "2" -> bot asks for the key
  sent = [];
  await handler.handleMessage(sock, dm('2'), SESSION);
  await wait();
  ok('bot asks for the API key', /API key/i.test(texts()), texts());
  const promptId = lastSentId;

  // 3) owner REPLIES to the prompt with the key -> stored live
  sent = [];
  await handler.handleMessage(sock, dmReply('E2E-KEY-123 https://api.example.com/e2e', promptId), SESSION);
  await wait();
  ok('key stored LIVE for instagram', apikeys.get('instagram') === 'E2E-KEY-123', apikeys.get('instagram'));
  ok('endpoint stored', apikeys.getService('instagram').endpoint === 'https://api.example.com/e2e', JSON.stringify(apikeys.getService('instagram')));
  ok('owner gets a confirmation', /set ho gayi/i.test(texts()), texts());

  // 4) one-liner `.apikey 1 <key>`
  sent = [];
  await handler.handleMessage(sock, dm('.apikey 1 TT-E2E-9'), SESSION);
  await wait();
  ok('.apikey 1 <key> sets tiktok', apikeys.get('tiktok') === 'TT-E2E-9', apikeys.get('tiktok'));

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed\n`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(fail === 0 ? 0 : 1);
})();
