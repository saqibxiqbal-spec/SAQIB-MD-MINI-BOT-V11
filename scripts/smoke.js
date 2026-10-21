/**
 * SAQIB MD — live smoke test
 * --------------------------
 * Loads every plugin and calls each command's handler with a MOCK context
 * (no real WhatsApp). Catches syntax/logic errors so we can confirm every
 * command at least runs without throwing. Network calls are real.
 *
 * Run: node scripts/smoke.js
 */
const path = require('path');
const fs = require('fs');
const registry = require('../plugins/_registry');

// ---- load plugins (same as index.js) ----
const pluginsDir = path.join(__dirname, '..', 'plugins');
const plugins = [];
for (const f of fs.readdirSync(pluginsDir).filter((x) => x.endsWith('.js') && !x.startsWith('_'))) {
  const plug = require(path.join(pluginsDir, f));
  if (Array.isArray(plug.commands) && typeof plug.handler === 'function') plugins.push({ file: f, ...plug });
}
registry.set(plugins);

function makeCtx(command) {
  const sent = [];
  const sock = {
    user: { id: '923000000000:1@s.whatsapp.net' },
    sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'x' } }; },
    profilePictureUrl: async () => 'https://i.imgur.com/2yaf2wb.png',
    groupMetadata: async () => ({ subject: 'Test GC', participants: [{ id: '923000000000@s.whatsapp.net', admin: 'admin' }], owner: '923000000000@s.whatsapp.net', creation: Math.floor(Date.now() / 1000), desc: 'test' }),
    groupInviteCode: async () => 'INVITECODE',
    groupRevokeInvite: async () => {},
    groupParticipantsUpdate: async () => {},
    groupSettingUpdate: async () => {},
    groupUpdateSubject: async () => {},
    groupUpdateDescription: async () => {},
    groupCreate: async () => ({ id: '123@g.us' }),
    groupLeave: async () => {},
    groupAcceptInvite: async () => {},
    groupRequestParticipantsList: async () => [],
    groupRequestParticipantsUpdate: async () => {},
    sendPresenceUpdate: async () => {},
    readMessages: async () => {},
    updateProfileStatus: async () => {},
    rejectCall: async () => {},
    fetchBlocklist: async () => [],
    updateBlockStatus: async () => {},
    fetchStatus: async () => [],
    getBusinessProfile: async () => ({}),
    updateProfilePicture: async () => {},
    fetchPrivacySettings: async () => ({}),
    updatePrivacySetting: async () => {},
  };
  const m = { key: { remoteJid: '923000000000@s.whatsapp.net', id: 'ABC123' }, message: { conversation: '.' + command }, pushName: 'Tester' };
  const ctx = {
    sock, m, from: m.key.remoteJid, isGroup: false, sender: m.key.remoteJid, senderNum: '923000000000',
    pushname: 'Tester', session: { ownerNumber: '923000000000' }, text: '.' + command, command, args: [], arg: '',
    quoted: null, isOwner: true,
    reply: async (txt, extra) => { sent.push({ jid: m.key.remoteJid, content: { text: String(txt), ...(extra || {}) } }); },
    sendSticker: async () => { sent.push({ sticker: true }); },
    send: async (jid, content) => { sent.push({ jid, content }); },
    react: async () => {},
  };
  ctx._sent = sent;
  return ctx;
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

(async () => {
  // Some commands (e.g. `restart`) call process.exit() — neutralize it so the
  // smoke test can keep running through every command.
  const realExit = process.exit.bind(process);
  process.exit = () => { /* ignored during smoke test */ };

  const cmds = [];
  for (const p of plugins) for (const c of p.commands) cmds.push(c);
  const errors = [];
  let ok = 0;
  // Run sequentially to keep logs clean; each command gets a short budget.
  for (const c of cmds) {
    const plug = registry.find(c);
    const ctx = makeCtx(c);
    try {
      await withTimeout(Promise.resolve(plug.handler(ctx)), 12000);
      ok++;
    } catch (e) {
      errors.push({ command: c, file: plug.file, error: e?.message || String(e) });
    }
  }
  const report = { total: cmds.length, ok, errors };
  fs.writeFileSync(path.join(__dirname, '..', 'smoke-result.json'), JSON.stringify(report, null, 2));
  console.log(`\n=== SMOKE TEST ===`);
  console.log(`Commands tested: ${cmds.length}`);
  console.log(`OK: ${ok}`);
  console.log(`Errors: ${errors.length}`);
  if (errors.length) {
    console.log('\n--- errors ---');
    for (const e of errors) console.log(`x ${e.command} (${e.file}): ${e.error}`);
  }
  process.exitCode = 0;
  setTimeout(() => realExit(0), 300);
})();
