/**
 * Functional smoke test — runs every master-plan command through the REAL
 * plugin handler with a mock ctx and checks it produces output without throwing.
 * Network commands are allowed to fail gracefully (a reply is still expected).
 * Run: node scripts/smoke-commands.js
 */
const fs = require('fs');
const path = require('path');

const pluginsDir = path.join(__dirname, '..', 'plugins');
const registry = new Map();
for (const f of fs.readdirSync(pluginsDir).filter((x) => x.endsWith('.js') && !x.startsWith('_'))) {
  try {
    const p = require(path.join(pluginsDir, f));
    if (Array.isArray(p.commands) && typeof p.handler === 'function') {
      for (const c of p.commands) if (!registry.has(c)) registry.set(c, p);
    }
  } catch { /* ignore */ }
}

function mockSock() {
  const noop = () => Promise.resolve({ key: { id: 'x' } });
  return {
    user: { id: '923001234567:1@s.whatsapp.net' },
    sendMessage: async (jid, content) => ({ key: { id: 'x' }, jid, content }),
    groupLeave: noop, groupFetchAllParticipating: async () => ({}),
    updateBlockStatus: noop, updateProfilePicture: noop, updateProfileStatus: noop,
    updateProfileName: noop, fetchStatus: async () => ({ status: 'busy' }),
    fetchBlocklist: async () => [], copyNForward: noop, readMessages: noop,
    sendPresenceUpdate: noop, relayMessage: noop, groupMetadata: async () => ({ participants: [] }),
  };
}

function mockCtx(command, arg = '') {
  const sent = [];
  return {
    command, arg, args: arg ? arg.split(' ') : [],
    from: '12345@g.us', isGroup: true,
    sender: '923001234567@s.whatsapp.net', senderNum: '923001234567',
    pushname: 'Tester', text: `.${command} ${arg}`.trim(),
    m: { key: { remoteJid: '12345@g.us', id: 'MOCK', fromMe: false }, message: {} },
    quoted: null, isOwner: true, isAdmin: true, sock: mockSock(),
    reply: (t, e = {}) => { sent.push({ type: 'reply', text: String(t), ...e }); return Promise.resolve(); },
    send: (jid, c, o = {}) => { sent.push({ type: 'send', jid, content: c, opts: o }); return Promise.resolve(); },
    sendSticker: () => Promise.resolve(), react: () => Promise.resolve(),
    _sent: sent,
  };
}

// command -> sample arg (only for commands that need one)
const CASES = {
  // P2 fun/characters
  roast: '', joke: '', aura: '', fool: '9231112223334', twin: '9231112223334',
  // P3 downloads (network — expect graceful reply, no crash)
  ytvideo: 'https://youtu.be/dQw4w9WgXcQ', song: 'https://youtu.be/dQw4w9WgXcQ',
  movie: 'Inception', capcut: 'Inception', apk: 'whatsapp', surah: 'yaseen', tts: 'hello',
  // P4 fonts
  font1: 'hello', font50: 'hello', mono: 'hello',
  // P5 premium
  antidelete: 'status', autoreact: 'status', pp: '9231112223334', gpp: '',
  // P6 owner (NOTE: .restart -> process.exit and .pair -> real session are
  // intentionally destructive; verified manually, excluded from automation)
  vv: '', vv2: '', vv3: '', block: '9231112223334',
  ban: '9231112223334', delete: '', leave: '', status: '', getbio: '9231112223334',
  setname: 'NewName', broadcast: 'hi',
  // P7 reactions
  hug: '9231112223334', kiss: '9231112223334', slap: '9231112223334',
  // P8 settings
  mode: 'public', prefix: '!', setprefix: '!', tagall: 'hi', hidetag: 'hi',
  promote: '9231112223334', demote: '9231112223334', groupstatus: 'hi',
  // P9 reset
  reset: 'all',
  // P10 sounds/tools
  sound: '', sound8: '', sound16: '', weather: 'Lahore', translate: 'hello | ur',
  qr: 'https://example.com', calc: '5*8+2', wiki: 'Pakistan',
  // core
  menu: '', ping: '', alive: '', help: '',
};

// Commands that are intentionally destructive / spawn real sessions.
const SKIP = new Set(['restart', 'pair', 'shutdown', 'logout']);

(async () => {
  const all = process.argv.includes('--all');
  const cases = all
    ? [...registry.keys()].filter((c) => !SKIP.has(c)).map((c) => [c, ''])
    : Object.entries(CASES);
  const timeoutMs = all ? 4000 : 12000;

  let ok = 0, bad = 0;
  const failures = [];
  for (const [cmd, arg] of cases) {
    const plug = registry.get(cmd);
    if (!plug) { bad++; failures.push(`${cmd}: NOT REGISTERED`); continue; }
    const ctx = mockCtx(cmd, arg);
    try {
      await Promise.race([
        plug.handler(ctx),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
      ]);
      const produced = ctx._sent.length > 0;
      if (produced) { ok++; }
      else { bad++; failures.push(`${cmd}: no output`); }
    } catch (e) {
      // graceful failure is fine as long as it didn't hard-crash
      if (ctx._sent.length > 0) { ok++; }
      else { bad++; failures.push(`${cmd}: threw ${e.message}`); }
    }
  }
  console.log(`\n=== COMMAND SMOKE (${all ? 'ALL' : 'master-plan'}): ${ok} ok, ${bad} bad ===`);
  if (failures.length) { console.log('Failures:'); failures.forEach((f) => console.log('  ❌ ' + f)); }
  process.exit(bad ? 1 : 0);
})();
