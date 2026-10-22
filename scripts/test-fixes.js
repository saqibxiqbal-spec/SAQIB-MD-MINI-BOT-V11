/**
 * Offline test harness — exercises plugin handlers with mock contexts.
 * No WhatsApp connection required. Run: node scripts/test-fixes.js
 */
const contacts = require('../lib/contacts');
const interactions = require('../lib/interactions');

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

/** Build a mock ctx that records outgoing sends. */
function mockCtx({ command, arg = '', quotedParticipant = null, senderNum = '923001234567', isGroup = true, text = '' } = {}) {
  const sent = [];
  const ctx = {
    command, arg, args: arg ? arg.split(' ') : [],
    from: isGroup ? '12345@g.us' : '923001234567@s.whatsapp.net',
    isGroup,
    sender: `${senderNum}@s.whatsapp.net`,
    senderNum,
    pushname: 'Tester',
    text: text || `!${command} ${arg}`.trim(),
    m: { key: { remoteJid: isGroup ? '12345@g.us' : '923001234567@s.whatsapp.net', id: 'MOCK', fromMe: false }, message: {} },
    quoted: quotedParticipant
      ? { key: { remoteJid: '12345@g.us', id: 'Q1', participant: quotedParticipant }, message: { conversation: 'hi' } }
      : null,
    isOwner: false,
    sock: {
      user: { id: '923001234567:1@s.whatsapp.net' },
      sendMessage: async (jid, content) => ({ key: { id: 'x' }, jid, content }),
      groupLeave: () => Promise.resolve(), groupFetchAllParticipating: async () => ({}),
      updateBlockStatus: () => Promise.resolve(), updateProfilePicture: () => Promise.resolve(),
      updateProfileStatus: () => Promise.resolve(), updateProfileName: () => Promise.resolve(),
      fetchStatus: async () => ({ status: 'busy' }), fetchBlocklist: async () => [],
      copyNForward: () => Promise.resolve(), relayMessage: () => Promise.resolve(),
    },
    reply: (txt, extra = {}) => { sent.push({ type: 'reply', text: String(txt), ...extra }); return Promise.resolve(); },
    send: (jid, content, opts = {}) => { sent.push({ type: 'send', jid, content, opts }); return Promise.resolve(); },
    react: () => Promise.resolve(),
  };
  ctx._sent = sent;
  return ctx;
}

const characters = require('../plugins/characters');
const fun = require('../plugins/fun');

(async () => {
  console.log('\n=== LID / mention resolution ===');

  // Learn a LID -> PN mapping
  contacts.learnFromMessage({ key: { participant: '212223345675336@lid', participantPn: '923451234567@s.whatsapp.net' } });
  ok('contacts.resolve maps LID -> PN', contacts.resolve('212223345675336@lid') === '923451234567@s.whatsapp.net');

  console.log('\n=== .fool (target is the fool, real number mention) ===');
  {
    // unresolved LID target -> must NOT use @s.whatsapp.net (no fake number)
    const ctx = mockCtx({ command: 'fool', quotedParticipant: '999888777666555@lid' });
    await characters.handler(ctx);
    const s = ctx._sent[0];
    ok('fool sends a message', !!s);
    const mention = s?.content?.mentions?.[0] || '';
    ok('unresolved LID mention keeps @lid domain', mention.endsWith('@lid'), `got ${mention}`);
    ok('fool text is name-safe (display name, no fake @number)', /Tester/.test(s?.content?.text || '') && !/@\d{10,}/.test(s?.content?.text || ''), `got ${s?.content?.text}`);
    ok('fool does NOT call the sender a fool', !/@923001234567/.test(s?.content?.text || ''));
  }
  {
    // resolved LID -> real number mention
    const ctx = mockCtx({ command: 'fool', quotedParticipant: '212223345675336@lid' });
    await characters.handler(ctx);
    const s = ctx._sent[0];
    ok('resolved LID mention uses real number', (s?.content?.mentions?.[0] || '') === '923451234567@s.whatsapp.net', `got ${s?.content?.mentions?.[0]}`);
    ok('resolved LID text shows real number', /@923451234567/.test(s?.content?.text || ''), `got ${s?.content?.text}`);
  }
  {
    // no target -> prompt, not a fake fool
    const ctx = mockCtx({ command: 'fool' });
    await characters.handler(ctx);
    ok('fool with no target prompts for a target', /reply|tag/i.test(ctx._sent[0]?.text || ''), `got ${ctx._sent[0]?.text}`);
  }

  console.log('\n=== role command mention ===');
  {
    const ctx = mockCtx({ command: 'dad', quotedParticipant: '9231112223334@s.whatsapp.net' });
    await characters.handler(ctx);
    const s = ctx._sent[0];
    ok('dad mentions target with correct jid', (s?.content?.mentions?.[0] || '') === '9231112223334@s.whatsapp.net', `got ${s?.content?.mentions?.[0]}`);
  }

  console.log('\n=== rating command (deterministic) ===');
  {
    const c1 = mockCtx({ command: 'chad', quotedParticipant: '9231112223334@s.whatsapp.net' });
    const c2 = mockCtx({ command: 'chad', quotedParticipant: '9231112223334@s.whatsapp.net' });
    await characters.handler(c1); await characters.handler(c2);
    ok('chad rating is deterministic', c1._sent[0]?.content?.text === c2._sent[0]?.content?.text, `${c1._sent[0]?.content?.text} vs ${c2._sent[0]?.content?.text}`);
    ok('chad rating mentions target', (c1._sent[0]?.content?.mentions?.[0] || '') === '9231112223334@s.whatsapp.net');
  }

  console.log('\n=== fun.js roast with LID target ===');
  {
    const ctx = mockCtx({ command: 'roast', quotedParticipant: '999888777666555@lid' });
    await fun.handler(ctx);
    const s = ctx._sent[0];
    ok('roast mention keeps @lid domain (no fake number)', (s?.content?.mentions?.[0] || '').endsWith('@lid'), `got ${s?.content?.mentions?.[0]}`);
  }

  console.log('\n=== .wyr interactive reply ===');
  {
    const ctx = mockCtx({ command: 'wyr' });
    await fun.handler(ctx);
    const s = ctx._sent[0];
    ok('wyr asks to reply 1 or 2', /reply \*1\*|1.*2/i.test(s?.text || ''), `got ${s?.text}`);
    // now simulate the user replying "1"
    const replyCtx = mockCtx({ text: '1', command: null });
    replyCtx.sender = '923001234567@s.whatsapp.net';
    replyCtx.from = '12345@g.us';
    const consumed = await interactions.handle(replyCtx);
    ok('interaction consumes the reply', consumed === true);
    ok('interaction produced a response', (replyCtx._sent[0]?.text || '').length > 0, `got ${replyCtx._sent[0]?.text}`);
  }

  console.log('\n=== .aura deterministic ===');
  {
    const a1 = mockCtx({ command: 'aura', senderNum: '923009999999' });
    const a2 = mockCtx({ command: 'aura', senderNum: '923009999999' });
    await fun.handler(a1); await fun.handler(a2);
    ok('aura is deterministic', a1._sent[0]?.content?.text === a2._sent[0]?.content?.text);
  }

  console.log('\n=== downloader: ytvideo/song audio-video choice ===');
  {
    const downloader = require('../plugins/downloader');
    const ytdlp = require('../lib/ytdlp');
    // stub the engine so we can observe which branch runs
    const calls = [];
    ytdlp.available = () => true;
    ytdlp.info = async () => ({ title: 'Test Song' });
    ytdlp.downloadAudioSmart = async (q) => { calls.push(['audio', q]); return writeTmp(); };
    ytdlp.downloadSongSmart = async (q) => { calls.push(['audio', q]); return { file: writeTmp(), title: 'Test Song', artists: 'Tester', source: 'JioSaavn' }; };
    ytdlp.downloadVideoSmart = async (q) => { calls.push(['video', q]); return { file: writeTmp(), audio: false }; };

    const ctx = mockCtx({ command: 'ytvideo', arg: 'Test Song' });
    await downloader.handler(ctx);
    const prompt = ctx._sent[0]?.text || '';
    ok('ytvideo prompts for 1/2 choice', /1️⃣/.test(prompt) && /2️⃣/.test(prompt), `got ${prompt}`);

    // user replies "2" -> video branch
    const replyCtx = mockCtx({ text: '2', command: null });
    replyCtx.sender = '923001234567@s.whatsapp.net';
    replyCtx.from = '12345@g.us';
    const consumed = await interactions.handle(replyCtx);
    ok('choice reply consumed', consumed === true);
    ok('video branch ran', calls.some((c) => c[0] === 'video'), JSON.stringify(calls));

    // .song -> reply "1" -> audio branch
    calls.length = 0;
    const ctx2 = mockCtx({ command: 'song', arg: 'Test Song' });
    await downloader.handler(ctx2);
    const replyCtx2 = mockCtx({ text: '1', command: null });
    replyCtx2.sender = '923001234567@s.whatsapp.net';
    replyCtx2.from = '12345@g.us';
    await interactions.handle(replyCtx2);
    ok('audio branch ran', calls.some((c) => c[0] === 'audio'), JSON.stringify(calls));
  }

  console.log('\n=== downloader: surah audio/video + apk + tts ===');
  {
    const downloader = require('../plugins/downloader');
    const c1 = mockCtx({ command: 'surah', arg: '1' });
    await downloader.handler(c1);
    ok('surah prompts audio/video', /Audio/.test(c1._sent[0]?.text || '') && /Video/.test(c1._sent[0]?.text || ''), `got ${c1._sent[0]?.text}`);
    const c2 = mockCtx({ command: 'apk' });
    await downloader.handler(c2);
    ok('apk with no arg errors', /naam do/i.test(c2._sent[0]?.text || ''), `got ${c2._sent[0]?.text}`);
    const c3 = mockCtx({ command: 'tts', arg: 'sad songs' });
    await downloader.handler(c3);
    ok('tts starts a search', /TikTok Search|engine/i.test(c3._sent[0]?.text || ''), `got ${c3._sent[0]?.text}`);
  }

  console.log('\n=== fonts (no "?" / replacement chars) ===');
  {
    const fonts = require('../plugins/fonts');
    let out = [];
    const fctx = (cmd, arg) => ({ command: cmd, arg, reply: (t) => { out.push(t); return Promise.resolve(); } });

    let allGood = true;
    for (let i = 1; i <= 105; i++) { out = []; await fonts.handler(fctx(`font${i}`, 'SAQIB Md 123')); if ((out[0] || '').includes('\uFFFD')) allGood = false; }
    ok('all 105 fonts free of replacement chars', allGood);

    out = []; await fonts.handler(fctx('font1', 'SAQIB'));
    ok('font1 renders bold S correctly', (out[0] || '').startsWith('\u{1D412}'), out[0]);

    out = []; await fonts.handler(fctx('mono', 'SAQIB'));
    ok('named "mono" font works', (out[0] || '').length > 0 && !(out[0] || '').includes('\uFFFD'), out[0]);

    ok('applyDefault() uses Mono by default', fonts.applyDefault('A') === fonts.style('A', 12));
  }

  console.log('\n=== premium: scoped anti-delete / autoreact / profile-pic ===');
  {
    const premium = require('../plugins/premium');
    const config = require('../config');

    // anti-delete chat scope
    // NOTE: toggles are PER-BOT (lib/userSettings), never the shared config.
    const userSettings = require('../lib/userSettings');
    const eff = () => userSettings.eff();
    let p = mockCtx({ command: 'antidelete', arg: 'chat on' });
    await premium.handler(p);
    ok('antidelete chat on -> ANTIDELETE_TO_CHAT=true', eff().ANTIDELETE_TO_CHAT === true);
    ok('antidelete status text shown', /Anti-delete/i.test(p._sent[0]?.text || ''), p._sent[0]?.text);

    p = mockCtx({ command: 'antidelete', arg: 'inbox off' });
    await premium.handler(p);
    ok('antidelete inbox off -> ANTIDELETE_TO_CHAT=false', eff().ANTIDELETE_TO_CHAT === false);

    // anti-delete all
    p = mockCtx({ command: 'antidelete', arg: 'all on' });
    await premium.handler(p);
    ok('antidelete all on -> both true', eff().ANTIDELETE === true && eff().ANTIDELETE_INBOX === true);
    ok('antidelete status reflects live values', /Master: ON/.test(p._sent[0]?.text || ''), p._sent[0]?.text);

    // autoreact scopes (PER-BOT: stored in lib/reactSettings, not config)
    const reactSettings = require('../lib/reactSettings');
    const sessNum = p.session?.number || p.session?.session?.number;
    reactSettings.set(sessNum, { autoReact: true, autoReactGroup: true, autoReactChat: true });
    p = mockCtx({ command: 'autoreact', arg: 'group off' });
    await premium.handler(p);
    const afterGroup = reactSettings.get(sessNum);
    ok('autoreact group off -> autoReactGroup=false', afterGroup.autoReactGroup === false);
    ok('autoreact chat untouched', afterGroup.autoReactChat === true);

    p = mockCtx({ command: 'autoreact', arg: 'all off' });
    await premium.handler(p);
    const afterAll = reactSettings.get(sessNum);
    ok('autoreact all off -> master+group+chat false', !afterAll.autoReact && !afterAll.autoReactGroup && !afterAll.autoReactChat);

    p = mockCtx({ command: 'autoreact', arg: 'status' });
    await premium.handler(p);
    ok('autoreact status shows scopes', /Group/.test(p._sent[0]?.text || '') && /Chat/.test(p._sent[0]?.text || ''), p._sent[0]?.text);

    // profile-pic command (mock sock.profilePictureUrl)
    const pp = mockCtx({ command: 'pp', senderNum: '923451234567' });
    pp.sock = { profilePictureUrl: async () => 'https://example.com/dp.jpg' };
    await premium.handler(pp);
    ok('pp sends an image', pp._sent[0]?.content?.image?.url === 'https://example.com/dp.jpg', JSON.stringify(pp._sent[0]?.content));

    const gpp = mockCtx({ command: 'gpp', isGroup: true });
    gpp.sock = { profilePictureUrl: async () => 'https://example.com/g.jpg' };
    await premium.handler(gpp);
    ok('gpp sends group image', gpp._sent[0]?.content?.image?.url === 'https://example.com/g.jpg');

    const gpp2 = mockCtx({ command: 'gpp', isGroup: false });
    gpp2.sock = { profilePictureUrl: async () => 'https://example.com/g.jpg' };
    await premium.handler(gpp2);
    ok('gpp in DM is rejected', /sirf group/i.test(gpp2._sent[0]?.text || ''), gpp2._sent[0]?.text);
  }

  console.log('\n=== owner: vv unwrap / pair / broadcast / delete ===');
  {
    const owner = require('../plugins/owner');

    // unwrapViewOnce unit tests
    ok('unwrap viewOnceMessage', !!owner.unwrapViewOnce({ viewOnceMessage: { message: { imageMessage: { a: 1 } } } }).imageMessage);
    ok('unwrap viewOnceMessageV2', !!owner.unwrapViewOnce({ viewOnceMessageV2: { message: { videoMessage: { a: 1 } } } }).videoMessage);
    ok('unwrap passes plain message through', !!owner.unwrapViewOnce({ imageMessage: { a: 1 } }).imageMessage);
    ok('unwrap view-once audio', !!owner.unwrapViewOnce({ viewOnceMessageV2Extension: { message: { audioMessage: { a: 1 } } } }).audioMessage);
    ok('unwrap null-safe', owner.unwrapViewOnce(null) === null);

    // .pair uses session manager
    const bot = require('../lib/bot');
    const origPair = bot.requestPair;
    bot.requestPair = async () => 'ABCD-1234';
    const pctx = mockCtx({ command: 'pair', arg: '923001234567' });
    await owner.handler(pctx);
    const pairText = pctx._sent.map((m) => m?.text || m?.content?.text || '').join('\n');
    ok('pair returns a pairing code', /ABCD-1234/.test(pairText), pairText);
    bot.requestPair = origPair;

    // .broadcast
    const bctx = mockCtx({ command: 'broadcast', arg: 'hello' });
    let sentCount = 0;
    bctx.sock = {
      groupFetchAllParticipating: async () => ({ '1@g.us': {}, '2@g.us': {} }),
      sendMessage: async () => { sentCount++; },
    };
    await owner.handler(bctx);
    ok('broadcast sends to all groups', sentCount === 2, `sent ${sentCount}`);
    ok('broadcast reports count', /2\/2/.test(bctx._sent[bctx._sent.length - 1]?.text || ''), bctx._sent[bctx._sent.length - 1]?.text);

    // .delete
    const dctx = mockCtx({ command: 'delete', quotedParticipant: '9231112223334@s.whatsapp.net' });
    let deleted = null;
    dctx.sock = { sendMessage: async (jid, content) => { if (content.delete) deleted = content.delete; } };
    await owner.handler(dctx);
    ok('delete removes the quoted message', deleted && deleted.id === 'Q1', JSON.stringify(deleted));
  }

  console.log('\n=== reactions: LID-safe mentions ===');
  {
    const reactions = require('../plugins/reactions');

    // unresolved LID target -> mention keeps @lid domain (no fake number)
    const c1 = mockCtx({ command: 'cry', quotedParticipant: '999888777666555@lid' });
    await reactions.handler(c1);
    const m1 = c1._sent[0]?.content?.mentions?.[0] || '';
    ok('reaction unresolved LID keeps @lid', m1.endsWith('@lid'), `got ${m1}`);
    ok('reaction text shows @999888777666555', /@999888777666555/.test(c1._sent[0]?.content?.text || ''), c1._sent[0]?.content?.text);

    // resolved LID -> real number mention
    const c2 = mockCtx({ command: 'cry', quotedParticipant: '212223345675336@lid' });
    await reactions.handler(c2);
    ok('reaction resolved LID uses real number', (c2._sent[0]?.content?.mentions?.[0] || '') === '923451234567@s.whatsapp.net', `got ${c2._sent[0]?.content?.mentions?.[0]}`);

    // no target -> 'tum', no mentions
    const c3 = mockCtx({ command: 'cry' });
    await reactions.handler(c3);
    ok('reaction with no target says "tum"', /tum/.test(c3._sent[0]?.content?.text || ''), c3._sent[0]?.content?.text);
    ok('reaction with no target has no mentions', (c3._sent[0]?.content?.mentions || []).length === 0);
  }

  console.log('\n=== settings: toggles + mode + prefix ===');
  {
    const settings = require('../plugins/settings');
    const config = require('../config');
    const prefixes = require('../lib/prefixes');

    let s1 = mockCtx({ command: 'autoread', arg: 'off' });
    await settings.handler(s1);
    ok('autoread off -> AUTO_READ=false', config.AUTO_READ === false);
    let s2 = mockCtx({ command: 'autoread', arg: 'on' });
    await settings.handler(s2);
    ok('autoread on -> AUTO_READ=true', config.AUTO_READ === true);
    config.AUTO_READ = false;

    let s3 = mockCtx({ command: 'autotyping' });
    await settings.handler(s3);
    ok('autotyping flips when no arg', config.AUTO_TYPING === true);
    config.AUTO_TYPING = false;

    let s4 = mockCtx({ command: 'mode', arg: 'private' });
    await settings.handler(s4);
    ok('mode private sets MODE', config.MODE === 'private');
    let s5 = mockCtx({ command: 'mode', arg: 'public' });
    await settings.handler(s5);
    ok('mode public sets MODE', config.MODE === 'public');

    let s6 = mockCtx({ command: 'prefix', arg: '!' });
    await settings.handler(s6);
    ok('prefix ! sets PER-USER prefix', prefixes.forUser(s6.senderNum) === '!');
    ok('prefix ! leaves global PREFIX untouched', config.PREFIX === '.');
    prefixes.set(s6.senderNum, null);

    let s7 = mockCtx({ command: 'mode', arg: 'bogus' });
    await settings.handler(s7);
    ok('mode rejects invalid arg', config.MODE === 'public' && /public|private/i.test(s7._sent[0]?.text || ''), s7._sent[0]?.text);
  }

  console.log('\n=== group: groupstatus ===');
  {
    const group = require('../plugins/group');
    const g = mockCtx({ command: 'groupstatus', arg: 'Salam' });
    let relayed = null;
    g.sock = {
      user: { id: '923106762478:5@s.whatsapp.net' },
      relayMessage: async (jid, msg) => { relayed = msg; },
      waUploadToServer: {},
    };
    await group.handler(g);
    ok('groupstatus relays a groupStatusMessageV2', !!(relayed && relayed.groupStatusMessageV2), Object.keys(relayed || {}).join(','));
    ok('groupstatus replies (success or fallback)', /laga diya|fail/i.test(g._sent[g._sent.length - 1]?.text || ''), g._sent[g._sent.length - 1]?.text);

    const g2 = mockCtx({ command: 'groupstatus' });
    g2.sock = { user: { id: 'x:1@s.whatsapp.net' }, relayMessage: async () => {}, waUploadToServer: {} };
    await group.handler(g2);
    ok('groupstatus with no text/media errors', /Text do|reply karo/i.test(g2._sent[0]?.text || ''), g2._sent[0]?.text);
  }

  console.log('\n=== .reset + interactive re-prompt ===');
  {
    const settings = require('../plugins/settings');
    const config = require('../config');

    // non-owner blocked
    const r0 = mockCtx({ command: 'reset', arg: 'all' });
    r0.isOwner = false;
    await settings.handler(r0);
    ok('reset blocked for non-owner', /owner/i.test(r0._sent[0]?.text || ''), r0._sent[0]?.text);

    // usage with no arg
    const r1 = mockCtx({ command: 'reset' });
    r1.isOwner = true;
    await settings.handler(r1);
    ok('reset shows usage', /reset all/i.test(r1._sent[0]?.text || ''), r1._sent[0]?.text);

    // reset single key
    config.MODE = 'private';
    const r2 = mockCtx({ command: 'reset', arg: 'MODE' });
    r2.isOwner = true;
    await settings.handler(r2);
    ok('reset MODE restores default', config.MODE === 'public', config.MODE);

    // reset all
    config.PREFIX = '!'; config.MODE = 'private';
    const r3 = mockCtx({ command: 'reset', arg: 'all' });
    r3.isOwner = true;
    await settings.handler(r3);
    ok('reset all restores defaults', config.PREFIX === '.' && config.MODE === 'public', `${config.PREFIX} ${config.MODE}`);

    // unknown key
    const r4 = mockCtx({ command: 'reset', arg: 'NOPE' });
    r4.isOwner = true;
    await settings.handler(r4);
    ok('reset unknown key errors', /Unknown/i.test(r4._sent[0]?.text || ''), r4._sent[0]?.text);

    // interactive out-of-range re-prompt
    const interactions = require('../lib/interactions');
    interactions.set('12345@g.us', '923001234567@s.whatsapp.net', 'choice', { options: [{ result: 'A' }, { result: 'B' }] });
    const ic = mockCtx({ command: null, text: '9' });
    const consumed = await interactions.handle(ic);
    ok('out-of-range choice is consumed + re-prompts', consumed === true && /1.*2|darmiyan/i.test(ic._sent[0]?.text || ''), ic._sent[0]?.text);
    interactions.clear('12345@g.us', '923001234567@s.whatsapp.net');
  }

  console.log('\n=== sounds (real ffmpeg audio) ===');
  {
    const sounds = require('../plugins/sounds');
    ok('sounds exports 16 commands', sounds.commands.length === 16, `got ${sounds.commands.length}`);

    let ffmpegOk = true;
    try {
      const buf = await sounds.synth('sound');
      ok('synth(sound) returns non-empty Buffer', Buffer.isBuffer(buf) && buf.length > 500, `len ${buf && buf.length}`);
      const buf8 = await sounds.synth('sound8');
      ok('synth(sound8) returns non-empty Buffer', Buffer.isBuffer(buf8) && buf8.length > 500, `len ${buf8 && buf8.length}`);
      // cache hit returns same buffer
      const again = await sounds.synth('sound');
      ok('synth is cached', again === buf);
    } catch (e) { ffmpegOk = false; console.log('  (ffmpeg unavailable — skipping synth asserts: ' + e.message + ')'); }

    // handler sends audio (or falls back to text) — never throws
    const ctx = mockCtx({ command: 'sound', quotedParticipant: '9231112223334@s.whatsapp.net' });
    await sounds.handler(ctx);
    const s = ctx._sent[0];
    ok('sound handler emits a message', !!s);
    if (ffmpegOk) {
      ok('sound handler sends audio content', s?.type === 'send' && !!s?.content?.audio, `type=${s?.type}`);
      ok('sound caption mentions target (real number)', /@9231112223334/.test(s?.content?.caption || ''), s?.content?.caption);
    }
  }

  console.log('\n=== tools (LID-safe mentions) ===');
  {
    const tools = require('../plugins/tools');
    // resolved LID -> real number
    const c1 = mockCtx({ command: 'chumi', quotedParticipant: '212223345675336@lid' });
    await tools.handler(c1);
    ok('chumi resolved LID uses real number mention', (c1._sent[0]?.mentions?.[0] || '') === '923451234567@s.whatsapp.net', `got ${c1._sent[0]?.mentions?.[0]}`);
    // unresolved LID -> keep @lid (no fake number)
    const c2 = mockCtx({ command: 'nikal', quotedParticipant: '999888777666555@lid' });
    await tools.handler(c2);
    ok('nikal unresolved LID keeps @lid domain', (c2._sent[0]?.mentions?.[0] || '').endsWith('@lid'), `got ${c2._sent[0]?.mentions?.[0]}`);
    ok('nikal does not invent a fake number', !/\+?999888777666555@s\.whatsapp\.net/.test(c2._sent[0]?.mentions?.[0] || ''), `got ${c2._sent[0]?.mentions?.[0]}`);
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
})();

function writeTmp() {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const p = path.join(os.tmpdir(), `test_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
  fs.writeFileSync(p, Buffer.from('test'));
  return p;
}
