/**
 * SAQIB MD — LIVE COMMAND CHECK
 * -----------------------------
 * Runs EVERY registered command through its real handler with a REAL phone
 * number context (owner + a second real number), and reports anything that:
 *   • CRASHES   — the handler threw an unhandled error
 *   • TIMEOUTS  — the handler never finished
 *   • UNHANDLED — the handler fell through to its "Unknown … command" default
 *   • NO-REPLY  — the handler produced no output at all
 *
 * Usage:
 *   node scripts/live-check.js            # fast: network stubbed (fails fast)
 *   node scripts/live-check.js --live     # real network for a curated subset
 *   node scripts/live-check.js --json=out.json
 *
 * Exit code is non-zero if any CRASH / UNHANDLED / NO-REPLY is found.
 */
const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);
const LIVE = ARGS.includes('--live');
const TIMEOUT = Number((ARGS.find((a) => a.startsWith('--timeout=')) || '').split('=')[1]) || 12000;
const JSON_OUT = (ARGS.find((a) => a.startsWith('--json=')) || '').split('=')[1] || '';

// ---- real numbers used for the test context --------------------------------
const OWNER_NUM = '923106762478';      // the bot's real owner number
const USER_NUM = '923001234567';       // a second real number (non-owner)
const TARGET_NUM = '923451234567';     // a real number to reply/mention

// ---------------------------------------------------------------------------
// 1. Stub the network so network commands fail fast (unless --live).
// ---------------------------------------------------------------------------
if (!LIVE) {
  global.fetch = async () => ({
    ok: false, status: 400, statusText: 'Bad Request (stubbed)',
    headers: new Map(), json: async () => ({}), text: async () => '',
    arrayBuffer: async () => new ArrayBuffer(0),
  });
}

// ---------------------------------------------------------------------------
// 2. Stub heavy engines so we never spawn yt-dlp / wait ~10s per image.
// ---------------------------------------------------------------------------
function fakeImageBuffer() {
  // 1x1 PNG signature + padding so isRealImage()'s size check passes.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  return Buffer.concat([png, Buffer.alloc(2048)]);
}
try {
  const imagegen = require('../lib/imagegen');
  imagegen.generateImage = async () => fakeImageBuffer();
  imagegen.sendGeneratedImage = async (ctx, prompt, caption) => {
    await ctx.send(ctx.from, { image: fakeImageBuffer(), caption: caption || prompt }, { quoted: ctx.m });
  };
  imagegen.isRealImage = () => true;
} catch { /* ignore */ }
try {
  const ytdlp = require('../lib/ytdlp');
  ytdlp.available = () => false;             // handlers reply "engine unavailable"
  ytdlp.info = async () => { throw new Error('stubbed'); };
  ytdlp.downloadAudio = async () => { throw new Error('stubbed'); };
  ytdlp.downloadVideo = async () => { throw new Error('stubbed'); };
  ytdlp.downloadAudioSmart = async () => { throw new Error('stubbed'); };
  ytdlp.downloadVideoSmart = async () => { throw new Error('stubbed'); };
} catch { /* ignore */ }

// ---------------------------------------------------------------------------
// 3. Load every plugin into the registry.
// ---------------------------------------------------------------------------
const dir = path.join(__dirname, '..', 'plugins');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort();
const list = [];
for (const f of files) {
  try {
    const p = require(path.join(dir, f));
    if (p && Array.isArray(p.commands) && typeof p.handler === 'function') list.push(Object.assign({}, p, { __file: f }));
  } catch (e) {
    console.log(`  ✗ plugin load failed: ${f} — ${e.message}`);
  }
}
const registry = require('../plugins/_registry.js');
registry.set(list);

// ---------------------------------------------------------------------------
// 4. Build a REAL-number mock context.
// ---------------------------------------------------------------------------
const GROUP_JID = '120363000000000000@g.us';
function mockSock(sent) {
  const noop = async () => ({ key: { id: 'x' } });
  // Record direct sock.sendMessage() calls too, so action-only commands
  // (e.g. .del, which deletes without replying) are not flagged NO-REPLY.
  const send = async (jid, content, opts) => { if (sent) sent.push({ kind: 'sock', jid, content, opts }); return { key: { id: 'x' } }; };
  return {
    user: { id: `${OWNER_NUM}:1@s.whatsapp.net`, lid: '111222333@lid' },
    sendMessage: send, readMessages: noop, sendPresenceUpdate: noop,
    profilePictureUrl: async () => 'https://example.com/p.jpg',
    groupMetadata: async () => ({ subject: 'Test Group', participants: [
      { id: `${OWNER_NUM}@s.whatsapp.net`, admin: 'superadmin' },
      { id: `${USER_NUM}@s.whatsapp.net`, admin: 'admin' },
    ] }),
    groupParticipantsUpdate: noop, groupRequestParticipantsUpdate: noop,
    groupRequestParticipantsList: async () => [], groupLeave: noop,
    groupUpdateSubject: noop, groupUpdateDescription: noop, groupSettingUpdate: noop,
    groupRevokeInvite: noop, groupInviteCode: async () => 'CODE', groupFetchAllParticipating: async () => ({}),
    groupCreate: async () => ({ id: GROUP_JID }), groupAcceptInvite: async () => 'x',
    updateBlockStatus: noop, updateProfileStatus: noop, updateProfilePicture: noop, updateProfileName: noop,
    fetchStatus: async () => ({ status: 'busy' }), fetchMessageHistory: async () => ({ messages: [] }),
    fetchBlocklist: async () => [], copyNForward: noop, relayMessage: noop, waUploadToServer: async () => ({}),
  };
}

function mockCtx(command, { isGroup = true, asOwner = true, arg = '' } = {}) {
  const sent = [];
  const senderNum = asOwner ? OWNER_NUM : USER_NUM;
  const from = isGroup ? GROUP_JID : `${OWNER_NUM}@s.whatsapp.net`;
  const ctx = {
    command, arg, args: arg ? arg.split(' ') : [],
    from, isGroup,
    sender: `${senderNum}@s.whatsapp.net`,
    senderNum, pushname: 'TestUser',
    text: `.${command}${arg ? ' ' + arg : ''}`,
    m: {
      key: { remoteJid: from, id: 'CHK' + Math.random().toString(36).slice(2, 9), fromMe: asOwner, participant: `${senderNum}@s.whatsapp.net` },
      message: { extendedTextMessage: { text: `.${command}`, contextInfo: { mentionedJid: [`${TARGET_NUM}@s.whatsapp.net`], participant: `${TARGET_NUM}@s.whatsapp.net`, stanzaId: 'Q1' } } },
      pushName: 'TestUser',
    },
    quoted: { key: { remoteJid: from, id: 'Q1', participant: `${TARGET_NUM}@s.whatsapp.net` }, message: { conversation: 'hi' }, pushName: 'Target' },
    isOwner: asOwner,
    sock: mockSock(sent),
    reply: (txt, extra = {}) => { sent.push({ kind: 'reply', text: String(txt), ...extra }); return Promise.resolve(); },
    send: (jid, content, opts = {}) => { sent.push({ kind: 'send', jid, content, opts }); return Promise.resolve(); },
    react: () => Promise.resolve(),
    sendSticker: () => Promise.resolve(),
  };
  ctx._sent = sent;
  return ctx;
}

// ---------------------------------------------------------------------------
// 5. Run one command and classify the outcome.
// ---------------------------------------------------------------------------
const UNHANDLED_RE = /❓\s*(Unknown[^\n]*command|Element command samajh nahi aaya|Country command samajh nahi aaya)/i;

function textsOf(ctx) {
  return ctx._sent.map((s) => s.text || s.content?.text || s.content?.caption || '').filter(Boolean);
}

async function runOne(command, plugin) {
  const ctx = mockCtx(command);
  const started = Date.now();
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('__TIMEOUT__')), TIMEOUT); });
  try {
    await Promise.race([Promise.resolve(plugin.handler(ctx)), timeout]);
  } catch (e) {
    clearTimeout(timer);
    if (String(e?.message) === '__TIMEOUT__') return { command, file: plugin.__file, status: 'TIMEOUT', ms: Date.now() - started };
    return { command, file: plugin.__file, status: 'CRASH', error: e?.message || String(e), ms: Date.now() - started };
  }
  clearTimeout(timer);
  const ms = Date.now() - started;
  const texts = textsOf(ctx);
  if (!texts.length && !ctx._sent.length) return { command, file: plugin.__file, status: 'NO-REPLY', ms };
  const first = texts[0] || '';
  if (UNHANDLED_RE.test(first)) return { command, file: plugin.__file, status: 'UNHANDLED', reply: first.slice(0, 60), ms };
  return { command, file: plugin.__file, status: 'OK', ms, reply: first.slice(0, 50) };
}

// ---------------------------------------------------------------------------
// 6. Sweep.
// ---------------------------------------------------------------------------
(async () => {
  // The curated subset for --live (real network, representative of each area).
  const LIVE_SAMPLE = [
    'menu', 'ping', 'alive', 'uptime', 'runtime', 'repo', 'owner',
    'weather', 'translate', 'wiki', 'calc', 'time', 'ip', 'qr', 'shorturl',
    'element', 'country', 'capital', 'flag',
    'hadith', 'quran', 'praytime', 'asma', 'dua', 'prophet',
    'hug', 'kiss', 'slap', 'dance', 'cry',
    'chad', 'simp', 'vibe', 'fool',
    'quote', 'joke', 'fact', 'advice', 'fortune',
    'githubstalk', 'define', 'yts',
    'currency', 'news', 'moon', 'base64', 'hash', 'password',
  ];

  const all = [];
  for (const p of list) for (const c of p.commands) all.push([c, p]);

  const targets = LIVE
    ? all.filter(([c]) => LIVE_SAMPLE.includes(c))
    : all;

  console.log(`\n=== LIVE COMMAND CHECK (${LIVE ? 'REAL network' : 'stubbed network'}) — ${targets.length} commands ===\n`);

  const results = [];
  let i = 0;
  for (const [cmd, plugin] of targets) {
    const r = await runOne(cmd, plugin);
    results.push(r);
    i++;
    if (i % 250 === 0) process.stdout.write(`  … ${i}/${targets.length}\n`);
  }

  const by = (s) => results.filter((r) => r.status === s);
  const crashes = by('CRASH');
  const timeouts = by('TIMEOUT');
  const unhandled = by('UNHANDLED');
  const noreply = by('NO-REPLY');
  const ok = by('OK');

  console.log(`\n--- SUMMARY ---`);
  console.log(`  ✅ OK        : ${ok.length}`);
  console.log(`  💥 CRASH     : ${crashes.length}`);
  console.log(`  ⏱️  TIMEOUT   : ${timeouts.length}`);
  console.log(`  ❓ UNHANDLED : ${unhandled.length}`);
  console.log(`  🔇 NO-REPLY  : ${noreply.length}`);

  const show = (label, arr) => {
    if (!arr.length) return;
    console.log(`\n--- ${label} ---`);
    for (const r of arr.slice(0, 60)) {
      console.log(`  • .${r.command}  [${r.file}]${r.error ? ' — ' + r.error : ''}${r.reply ? ' — ' + r.reply : ''}`);
    }
    if (arr.length > 60) console.log(`  … +${arr.length - 60} more`);
  };
  show('CRASHES', crashes);
  show('TIMEOUTS', timeouts);
  show('UNHANDLED (registered but handler fell through)', unhandled);
  show('NO-REPLY', noreply);

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
    console.log(`\nFull results written to ${JSON_OUT}`);
  }

  const bad = crashes.length + unhandled.length + noreply.length;
  console.log(`\n=== RESULT: ${bad === 0 ? 'PASS ✅' : 'FAIL ❌'} (${bad} issue(s)) ===\n`);
  process.exit(bad === 0 ? 0 : 1);
})();
