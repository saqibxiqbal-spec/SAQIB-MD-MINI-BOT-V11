/**
 * SAQIB MD — full per-command live-output verification
 * Captures each command's actual reply text and classifies the result.
 * Run: bun test/verify-all.js
 */
process.env.SESSION_DIR = process.env.SESSION_DIR || './.test-session';
const fs = require('fs');
const path = require('path');
const OUT_DIR = path.join(__dirname, '..', 'reports');
fs.mkdirSync(OUT_DIR, { recursive: true });

const realExit = process.exit.bind(process);
process.exit = () => {};

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

const sock = {
  user: { id: '923106762478:1@s.whatsapp.net' },
  sendMessage: async () => ({ key: { id: 'SENT' } }),
  readMessages: async () => {}, sendPresenceUpdate: async () => {},
  profilePictureUrl: async () => 'https://example.com/p.jpg',
  groupMetadata: async () => ({ subject: 'G', participants: [{ id: '923106762478@s.whatsapp.net', admin: 'admin' }], creation: 1600000000, owner: '923106762478@s.whatsapp.net', desc: 'test' }),
  groupParticipantsUpdate: async () => {}, groupSettingUpdate: async () => {},
  groupInviteCode: async () => 'CODE123', groupRevokeInvite: async () => {},
  groupUpdateSubject: async () => {}, groupUpdateDescription: async () => {},
  updateBlockStatus: async () => {}, fetchStatus: async () => [{ status: 'hi' }],
  updateProfileStatus: async () => {}, updateProfileName: async () => {}, updateProfilePicture: async () => {},
  requestPairingCode: async () => 'ABCD1234', groupFetchAllParticipating: async () => ({}),
  fetchBlocklist: async () => [], copyNForward: async () => {}, groupLeave: async () => {},
};

function makeCtx(command, arg) {
  const out = [];
  const m = { key: { remoteJid: '123@g.us', id: 'MSGID' + Math.random(), participant: '923106762478@s.whatsapp.net' }, message: { conversation: '.' + command + (arg ? ' ' + arg : '') }, pushName: 'Tester' };
  return {
    sock, m, from: '123@g.us', isGroup: true, sender: '923106762478@s.whatsapp.net', senderNum: '923106762478', pushname: 'Tester',
    text: '.' + command + (arg ? ' ' + arg : ''), command, args: arg ? arg.split(' ') : [], arg, quoted: null, isOwner: true,
    reply: async (t) => { out.push(String(t)); },
    sendSticker: async () => {}, send: async (jid, c) => { out.push('[MEDIA] ' + JSON.stringify(c).slice(0, 200)); return { key: { id: 'SENT' } }; },
    react: async () => {}, _out: out,
  };
}

const NET = new Set(['song','play','music','ytaudio','ytmp3','ytmp4','ytvideo','video','apk','tts','ttsearch','tiktoksearch','tiktok','tt','ttmp3','instagram','ig','igdl','reels','facebook','fb','twitter','x','pinterest','pin','ss','carbon','tourl','imagine','image','img','logo','emojimix','news','weather','wiki','currency','exchange','fx','ip','quote2','joke2','define','githubstalk','praytime','getpp','say','speak','voice']);

// Sample args so commands that need input give a real answer, not just usage text
const ARGS = {
  ai: 'hello what is 2+2', bot: 'hello', gpt: 'what is 2+2', chatgpt: 'what is 2+2',
  calc: '25*4+7', translate: 'en salam kya haal hai', tr: 'en hello world', qr: 'hello',
  shorturl: 'https://github.com', short: 'https://github.com', base64: 'encode hello',
  weather: 'Lahore', wthr: 'Lahore', wiki: 'Pakistan', define: 'computer', news: '',
  currency: '100 USD PKR', exchange: '100 USD PKR', fx: '100 USD PKR', ip: '1.1.1.1',
  praytime: 'Lahore', githubstalk: 'whiskeysockets', yts: 'laptop', ytaudio: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  password: '20', moon: '', time: '', joke: '', fact: '', quote: '', shayari: '', roast: '',
  compliment: '', '8ball': 'will it work', dice: '', coin: '', slot: '', aura: '', rate: '100',
  character: '', truth: '', dare: '', wyr: '', rizz: '', pickup: '', emoji: 'happy',
  font1: 'hello', font: 'hello', repeat: 'hello x3', heart: '',
  sticker: '', s: '', toimg: '', tomp3: '', bass: '', deep: '',
  unban0: '923000000001', warn: '', poll: 'Q | a | b', tagall: 'hello',
  sound: '1', anime: 'naruto', waifu: '', neko: '', surah: '1',
  say: 'hello world', speak: 'hello world', voice: 'hello world', carbon: 'console.log(1)',
  imagine: 'a pink dragon', img: 'a pink dragon', image: 'a pink dragon',
  logo: 'SAQIB', neon: 'SAQIB', glitch: 'SAQIB', emojimix: 'happy+sad', meme: '', gitclone: 'https://github.com/whiskeysockets/baileys',
  dlnpm: 'express', getpp: '@923106762478', id: '', owner: '', menu: '', menuall: '', ping: '', alive: '', uptime: '', runtime: '', repo: '',
};

const ERROR_PAT = /(❌|⚠|error|failed|not found|unavailable|try again|tidak|gagal|invalid api|rate.?limit|missing)/i;

const withTimeout = (p, ms) => Promise.race([
  Promise.resolve(p).then(() => 'ok').catch((e) => 'ERR: ' + (e && e.message ? e.message : e)),
  new Promise((r) => setTimeout(() => r('timeout'), ms)),
]);

(async () => {
  const all = [];
  for (const p of plugins) for (const c of p.commands) all.push({ c, p });
  const results = [];
  let idx = 0;

  for (const { c, p } of all) {
    idx++;
    const arg = ARGS[c] !== undefined ? ARGS[c] : '';
    const ctx = makeCtx(c, arg);
    const res = await withTimeout(p.handler(ctx), NET.has(c) ? 8000 : 4000);
    const reply = ctx._out.join(' | ').slice(0, 300);
    let status;
    if (res === 'timeout') status = 'TIMEOUT';
    else if (typeof res === 'string' && res.startsWith('ERR:')) status = 'CRASH';
    else if (!reply.trim()) status = 'SILENT';
    else status = ERROR_PAT.test(reply) ? 'ERROR_REPLY' : 'OK';
    results.push({ cmd: '.' + c, plugin: p.file, status, reply });
    if (status !== 'OK') console.log(`[${idx}/${all.length}] ${status}  .${c}  (${p.file})  -> ${reply}`);
    if (idx % 100 === 0) console.log(`... ${idx}/${all.length} done`);
  }

  const by = {};
  for (const r of results) by[r.status] = (by[r.status] || 0) + 1;
  fs.writeFileSync(OUT_DIR + '/report-all-commands.json', JSON.stringify(results, null, 2));

  const md = [];
  md.push(`# SAQIB MD — Full Command Verification Report`);
  md.push(`Date: ${new Date().toISOString()}\n`);
  md.push(`Total commands: **${results.length}**`);
  for (const [k, v] of Object.entries(by)) md.push(`- ${k}: ${v}`);
  md.push(`\n## Non-OK commands (error proof)\n`);
  for (const r of results.filter(r => r.status !== 'OK')) md.push(`### ${r.cmd} (${r.plugin}) — ${r.status}\n> ${r.reply || '(no output)'}\n`);
  md.push(`\n## Full list\n`);
  md.push(`| Command | Plugin | Status | Reply |`);
  md.push(`|---|---|---|---|`);
  for (const r of results) md.push(`| ${r.cmd} | ${r.plugin} | ${r.status} | ${(r.reply || '').replace(/\|/g, '/').replace(/\n/g, ' ')} |`);
  fs.writeFileSync(OUT_DIR + '/report-all-commands.md', md.join('\n'));

  console.log(`\n=== FINAL ===`);
  console.log(JSON.stringify(by));
  realExit(0);
})();
