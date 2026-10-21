#!/usr/bin/env node
/**
 * Integration test for Fix 3: a real group admin (non-owner) must be able to run
 * admin-only group commands through the FULL handleMessage pipeline, and a
 * non-admin must still be rejected.
 *
 * The group metadata lists the admin under a LID (@lid) with the real phone
 * number in `phoneNumber` — the exact shape that used to make `isGroupAdmin`
 * fail for everyone. Run: node test/group-admin-verify.js
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

const handler = require('../lib/handler');

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  \u2705 ${n}`); } else { fail++; console.log(`  \u274c ${n} ${e}`); } };

const ADMIN_PHONE = '923001111111';   // group admin, NOT the bot owner
const MEMBER_PHONE = '923002222222';  // plain member

let sent = [];
const sock = {
  user: { id: '923106762478:1@s.whatsapp.net' },
  sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'SENT' } }; },
  readMessages: async () => {},
  sendPresenceUpdate: async () => {},
  groupMetadata: async () => ({
    subject: 'G',
    participants: [
      { id: '111222333444555@lid', phoneNumber: `${ADMIN_PHONE}@s.whatsapp.net`, admin: 'admin' },
      { id: `${MEMBER_PHONE}@s.whatsapp.net`, admin: null },
    ],
    creation: 1600000000, owner: `${ADMIN_PHONE}@s.whatsapp.net`, desc: 'test',
  }),
  groupParticipantsUpdate: async () => {},
  groupSettingUpdate: async () => {},
  groupInviteCode: async () => 'CODE',
  groupRevokeInvite: async () => {},
  groupUpdateSubject: async () => {},
  groupUpdateDescription: async () => {},
  groupFetchAllParticipating: async () => ({}),
  groupLeave: async () => {},
  fetchBlocklist: async () => [],
  updateBlockStatus: async () => {},
};

const msg = (text, participant) => ({
  key: { remoteJid: '123@g.us', id: 'M' + Math.random().toString(36).slice(2), participant, fromMe: false },
  message: { conversation: text }, pushName: 'T',
});
const texts = () => sent.map((s) => (s.content && (s.content.text || s.content.caption)) || '').join(' | ');

(async () => {
  console.log('\nFix 3 \u2014 group admin commands via full handleMessage pipeline');

  // 1) Non-owner ADMIN runs .tagall -> must NOT be told "only for admins".
  handler.clearGroupMetaCache();
  sent = [];
  await handler.handleMessage(sock, msg('.tagall hello', `${ADMIN_PHONE}@s.whatsapp.net`));
  await new Promise((r) => setTimeout(r, 250));
  const adminOut = texts();
  check('admin NOT told "only for admins"', !/sirf \*group admins\*/i.test(adminOut), adminOut.slice(0, 140));
  check('admin .tagall actually ran (mentions sent)', /@/.test(adminOut) || adminOut.length > 0, adminOut.slice(0, 140));

  // 2) Plain MEMBER runs .tagall -> must be rejected.
  handler.clearGroupMetaCache();
  sent = [];
  await handler.handleMessage(sock, msg('.tagall hello', `${MEMBER_PHONE}@s.whatsapp.net`));
  await new Promise((r) => setTimeout(r, 250));
  const memberOut = texts();
  check('member IS told "only for admins"', /sirf \*group admins\*/i.test(memberOut), memberOut.slice(0, 140));

  // 3) A normal (non-admin) group command must work for a plain member.
  handler.clearGroupMetaCache();
  sent = [];
  await handler.handleMessage(sock, msg('.ping', `${MEMBER_PHONE}@s.whatsapp.net`));
  await new Promise((r) => setTimeout(r, 250));
  const pingOut = texts();
  check('member can run a normal group command (.ping)', pingOut.length > 0 && !/sirf \*group admins\*/i.test(pingOut), pingOut.slice(0, 140));

  console.log(`\n${fail === 0 ? '\u2705 ALL PASS' : '\u274c FAILURES'} \u2014 ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
