#!/usr/bin/env node
/**
 * Verifies the status view / status like fix (Bug 3).
 *
 * OLD behaviour: lib/bot.js `continue`d past EVERY status message unless
 * AUTOSTATUS/AUTOREAD_STATUS was already ON, so `.statusview on` and
 * `.statuslike on` looked ON in the menu but never reached the handler ->
 * "on to ho jaate hain lekin kaam nahin karte".
 *
 * Run: node test/status-viewlike.js
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const premium = require('../plugins/premium');

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  \u2705 ${n}`); } else { fail++; console.log(`  \u274c ${n} ${e}`); } };

/* ---- 1) the bot.js gate must let status through for ALL the flags ---- */
console.log('\n1) lib/bot.js status gate');
const botSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'bot.js'), 'utf8');
const gateLine = botSrc.split('\n').find((l) => l.includes('config.AUTOSTATUS') && l.includes('continue')) || '';
check('gate exists', !!gateLine);
for (const flag of ['AUTOSTATUS', 'AUTOREAD_STATUS', 'STATUSVIEW', 'STATUSLIKE']) {
  check(`gate allows ${flag}`, gateLine.includes(flag), gateLine.trim());
}
// AUTO_REACT is now PER-SESSION (lib/reactSettings.js) and surfaces in the gate as `rsAuto`.
check('gate allows per-session AUTO_REACT (rsAuto)', gateLine.includes('rsAuto'), gateLine.trim());

/* ---- 2) premium.onMessage must view + react to a status ---- */
function makeCtx() {
  const calls = { read: 0, react: 0, reactJid: null, statusJidList: null };
  const sock = {
    readMessages: async () => { calls.read++; },
    sendMessage: async (jid, content, opts) => {
      if (content && content.react) { calls.react++; calls.reactJid = jid; calls.statusJidList = opts && opts.statusJidList; }
      return { key: { id: 'x' } };
    },
    sendPresenceUpdate: async () => {},
  };
  const m = {
    key: { remoteJid: 'status@broadcast', id: 'ST1', participant: '923001234567@s.whatsapp.net' },
    message: { imageMessage: { caption: 'hi' } },
    pushName: 'Tester',
  };
  return {
    calls,
    ctx: { sock, m, from: 'status@broadcast', isGroup: false, sender: '923001234567@s.whatsapp.net', senderNum: '923001234567', text: '', command: '', isOwner: false, session: null },
  };
}

(async () => {
  console.log('\n2) premium.onMessage — status VIEW (.statusview on)');
  config.STATUSVIEW = true; config.STATUSLIKE = false; config.AUTOSTATUS = false; config.AUTOREAD_STATUS = false; config.AUTO_REACT = false;
  let t = makeCtx();
  await premium.onMessage(t.ctx);
  await new Promise((r) => setTimeout(r, 50));
  check('status was VIEWED (readMessages called)', t.calls.read === 1, JSON.stringify(t.calls));
  check('no react when only view is on', t.calls.react === 0, JSON.stringify(t.calls));

  console.log('\n3) premium.onMessage — status LIKE (.statuslike on)');
  config.STATUSVIEW = false; config.STATUSLIKE = true;
  t = makeCtx();
  await premium.onMessage(t.ctx);
  await new Promise((r) => setTimeout(r, 50));
  check('status was REACTED to', t.calls.react === 1, JSON.stringify(t.calls));
  check('react sent to status@broadcast', t.calls.reactJid === 'status@broadcast', String(t.calls.reactJid));
  check('react targeted the author (statusJidList)', Array.isArray(t.calls.statusJidList) && t.calls.statusJidList[0] === '923001234567@s.whatsapp.net', JSON.stringify(t.calls.statusJidList));
  check('like alone does NOT view', t.calls.read === 0, JSON.stringify(t.calls));

  console.log('\n4) both ON');
  config.STATUSVIEW = true; config.STATUSLIKE = true;
  t = makeCtx();
  await premium.onMessage(t.ctx);
  await new Promise((r) => setTimeout(r, 50));
  check('viewed AND reacted', t.calls.read === 1 && t.calls.react === 1, JSON.stringify(t.calls));

  console.log('\n5) all OFF — nothing happens');
  config.STATUSVIEW = false; config.STATUSLIKE = false; config.AUTOSTATUS = false; config.AUTOREAD_STATUS = false; config.AUTO_REACT = false;
  t = makeCtx();
  await premium.onMessage(t.ctx);
  await new Promise((r) => setTimeout(r, 50));
  check('no view, no react', t.calls.read === 0 && t.calls.react === 0, JSON.stringify(t.calls));

  console.log(`\n${fail === 0 ? '\u2705 ALL PASS' : '\u274c FAILURES'} \u2014 ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
