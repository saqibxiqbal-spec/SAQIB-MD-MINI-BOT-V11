#!/usr/bin/env node
/**
 * Verifies the three fixes requested for SAQIB-MD-MINI-BOT-V11:
 *
 *   Fix 1 — song download: JioSaavn is now the PRIMARY audio source (YouTube
 *           blocks datacenter IPs). Live test of ytdlp.downloadSongSmart().
 *   Fix 2 — status auto-react is a GREEN HEART (🟢✋) by default and follows
 *           config.STATUS_EMOJI (changeable live with `.statusemoji`).
 *   Fix 3 — group admin detection is LID-AWARE, so admin commands no longer
 *           answer "sirf group admins ke liye hai" for real admins.
 *
 * Run: node test/fixes-verify.js
 */
const config = require('../config');
const premium = require('../plugins/premium');
const handler = require('../lib/handler');
const ytdlp = require('../lib/ytdlp');

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  \u2705 ${n}`); } else { fail++; console.log(`  \u274c ${n} ${e}`); } };
const GREEN_HEART = '\u{1F49A}';

/* ============================ Fix 2: green heart ============================ */
function statusCtx() {
  const calls = { react: 0, text: null };
  const sock = {
    readMessages: async () => {},
    sendMessage: async (jid, content) => {
      if (content && content.react) { calls.react++; calls.text = content.react.text; }
      return { key: { id: 'x' } };
    },
    sendPresenceUpdate: async () => {},
  };
  const m = { key: { remoteJid: 'status@broadcast', id: 'ST1', participant: '923001234567@s.whatsapp.net' }, message: { imageMessage: { caption: 'hi' } }, pushName: 'T' };
  return { calls, ctx: { sock, m, from: 'status@broadcast', isGroup: false, sender: '923001234567@s.whatsapp.net', senderNum: '923001234567', text: '', command: '', isOwner: false, session: null } };
}

/* ============================ Fix 3: LID-aware admin ======================= */
function groupSock() {
  return {
    groupMetadata: async () => ({
      subject: 'Test GC',
      participants: [
        // Admin listed under a LID, with the real phone number in phoneNumber —
        // this is exactly the shape that broke the old `id === sender` compare.
        { id: '111222333444555@lid', phoneNumber: '923001234567@s.whatsapp.net', admin: 'admin' },
        { id: '923009999999@s.whatsapp.net', admin: null },
      ],
    }),
  };
}

(async () => {
  /* -------- Fix 2 -------- */
  console.log('\n1) Fix 2 — status auto-react is a green heart');
  check('config.STATUS_EMOJI defaults to the green heart', config.STATUS_EMOJI === GREEN_HEART, JSON.stringify(config.STATUS_EMOJI));
  config.STATUSVIEW = false; config.STATUSLIKE = true; config.AUTOSTATUS = false; config.AUTOREAD_STATUS = false; config.AUTO_REACT = false;
  let t = statusCtx();
  await premium.onMessage(t.ctx);
  await new Promise((r) => setTimeout(r, 60));
  check('status react fired', t.calls.react === 1, JSON.stringify(t.calls));
  check('status react is the green heart', t.calls.text === GREEN_HEART, JSON.stringify(t.calls.text));
  // .statusemoji should be able to change it (config-driven).
  const saved = config.STATUS_EMOJI;
  config.STATUS_EMOJI = '\u2764\uFE0F';
  t = statusCtx();
  await premium.onMessage(t.ctx);
  await new Promise((r) => setTimeout(r, 60));
  check('status react follows config.STATUS_EMOJI', t.calls.text === '\u2764\uFE0F', JSON.stringify(t.calls.text));
  config.STATUS_EMOJI = saved;

  /* -------- Fix 3 -------- */
  console.log('\n2) Fix 3 — group admin detection is LID-aware');
  handler.clearGroupMetaCache();
  const gs = groupSock();
  check('admin matched by phone JID vs LID metadata', (await handler.isGroupAdmin(gs, 'g1@g.us', '923001234567@s.whatsapp.net')) === true);
  handler.clearGroupMetaCache();
  check('non-admin correctly rejected', (await handler.isGroupAdmin(gs, 'g2@g.us', '923009999999@s.whatsapp.net')) === false);
  handler.clearGroupMetaCache();
  check('admin matched by bare number (no domain)', (await handler.isGroupAdmin(gs, 'g3@g.us', '923001234567')) === true);
  handler.clearGroupMetaCache();
  check('unknown member rejected', (await handler.isGroupAdmin(gs, 'g4@g.us', '923007777777@s.whatsapp.net')) === false);

  /* -------- Fix 1 -------- */
  console.log('\n3) Fix 1 — song download via JioSaavn (live)');
  try {
    const r = await ytdlp.downloadSongSmart('Tum Hi Ho Arijit Singh');
    const fs = require('fs');
    check('downloadSongSmart returned a file', !!(r && r.file && fs.existsSync(r.file)), JSON.stringify(r && r.file));
    check('file is non-trivial (>1MB)', r && fs.existsSync(r.file) && fs.statSync(r.file).size > 1024 * 1024, r ? String(fs.statSync(r.file).size) : 'n/a');
    check('metadata carries the real title', !!(r && r.title), JSON.stringify(r && r.title));
    check('metadata carries artists', !!(r && r.artists), JSON.stringify(r && r.artists));
    console.log(`     -> "${r.title}" by ${r.artists} [${r.source}] ${(fs.statSync(r.file).size / 1048576).toFixed(2)} MB`);
    try { fs.unlinkSync(r.file); } catch { /* ignore */ }
  } catch (e) {
    check('downloadSongSmart (live)', false, e.message);
  }

  console.log(`\n${fail === 0 ? '\u2705 ALL PASS' : '\u274c FAILURES'} \u2014 ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
