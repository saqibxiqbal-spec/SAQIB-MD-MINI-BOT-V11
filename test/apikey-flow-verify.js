/**
 * Verifies the INTERACTIVE `.apikey` flow:
 *   .apikey            -> numbered list (1 Tiktok, 2 Instagram, 3 Song, 4 Video)
 *   reply "2"          -> bot asks for the API key
 *   reply <key>        -> key stored LIVE (MongoDB / local mirror)
 *   .apikey 3 <key> [endpoint] -> one-liner set
 *   downloader         -> audio uses `song`, video uses `video` (fallback `youtube`)
 */
process.env.MONGODB_URI = '';
process.env.SESSION_DIR = './.test-session-apikey/data';

const config = require('../config');
const apikeys = require('../lib/apikeys');
const interactions = require('../lib/interactions');
const owner = require('../plugins/owner');

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${e}`); } };

const FROM = 'g@g.us';
const OWNER = '923009999999@s.whatsapp.net';

function makeCtx({ text = '', command = '', arg = '', quoted = null, isOwner = true, sender = OWNER } = {}) {
  const replies = [];
  const sends = [];
  let seq = 0;
  const ctx = {
    command, arg, args: String(arg || '').split(/\s+/).filter(Boolean), prefix: '.',
    from: FROM, isGroup: true, sender, senderNum: sender.split('@')[0], isOwner,
    text, quoted,
    m: { key: { remoteJid: FROM, id: 'M1' } },
    session: { number: '923009999999' },
    reply: async (t) => { replies.push(String(t)); const id = 'P' + (++seq); ctx.lastReplyId = id; return { key: { id } }; },
    send: async (jid, content) => { sends.push({ jid, content }); return { key: { id: 'S' + (++seq) } }; },
    sock: { sendMessage: async () => ({ key: { id: 'x' } }), sendPresenceUpdate: async () => {} },
  };
  return { ctx, replies, sends };
}

(async () => {
  console.log('\n=== INTERACTIVE .apikey FLOW ===');

  ['tiktok', 'instagram', 'song', 'video', 'youtube'].forEach((s) => apikeys.remove(s));

  // 1) `.apikey` -> numbered menu
  const c1 = makeCtx({ command: 'apikey', arg: '' });
  await owner.handler(c1.ctx);
  const menu = c1.replies.join('\n');
  ok('.apikey shows the numbered list', /Tiktok/i.test(menu) && /Instagram/i.test(menu) && /Song/i.test(menu) && /Video/i.test(menu), menu);
  ok('menu is numbered 1..4', /1/.test(menu) && /4/.test(menu), menu);
  ok('menu tells the owner to reply a number', /number reply/i.test(menu), menu);

  // 2) owner replies "2" (plain, non-command) -> bot asks for the key
  const c2 = makeCtx({ text: '2' });
  const consumed = await interactions.handle(c2.ctx);
  ok('number reply is consumed by the flow', consumed === true);
  ok('bot asks for the API key', /API key/i.test(c2.replies.join(' ')), c2.replies.join(' '));
  ok('bot says to REPLY to the prompt', /reply/i.test(c2.replies.join(' ')), c2.replies.join(' '));
  const promptId = c2.ctx.lastReplyId;
  ok('a prompt message id was captured', !!promptId, String(promptId));

  // 3) owner REPLIES to that prompt with "key [endpoint]" -> stored live
  const c3 = makeCtx({ text: 'IG-SECRET-777 https://api.example.com/ig', quoted: { key: { id: promptId } } });
  const consumed2 = await interactions.handle(c3.ctx);
  ok('key reply is consumed', consumed2 === true);
  ok('key stored LIVE for instagram', apikeys.get('instagram') === 'IG-SECRET-777', apikeys.get('instagram'));
  const rec = apikeys.getService('instagram');
  ok('endpoint stored too', !!(rec && rec.endpoint === 'https://api.example.com/ig'), JSON.stringify(rec));
  ok('confirmation shown', /set ho gayi/i.test(c3.replies.join(' ')), c3.replies.join(' '));

  // 4) one-liner `.apikey 3 <key> <endpoint>`
  const c4 = makeCtx({ command: 'apikey', arg: '3 SONG-KEY-1 https://api.example.com/ytmp3' });
  await owner.handler(c4.ctx);
  ok('.apikey 3 <key> <endpoint> sets song', apikeys.get('song') === 'SONG-KEY-1' && apikeys.getService('song').endpoint === 'https://api.example.com/ytmp3', JSON.stringify(apikeys.getService('song')));

  // 5) out-of-range number
  const c5 = makeCtx({ command: 'apikey', arg: '9' });
  await owner.handler(c5.ctx);
  ok('.apikey 9 is rejected', /1.*se.*4/i.test(c5.replies.join(' ')), c5.replies.join(' '));

  // 6) a NON-owner reply must NOT be consumed (owner-only)
  const c6 = makeCtx({ text: '1', isOwner: false, sender: '923001111111@s.whatsapp.net' });
  const consumed3 = await interactions.handle(c6.ctx);
  ok('non-owner reply is ignored', consumed3 === false);

  // 7) downloader routing: video -> `video` service, audio -> `song` service
  const downloader = require('../plugins/downloader');
  let captured = null;
  global.fetch = async (url) => {
    captured = String(url);
    return { ok: true, status: 200, json: async () => ({ success: true, data: { title: 'T', url: 'https://cdn/v.mp4', music: 'https://cdn/a.mp3' } }) };
  };

  apikeys.set('video', 'VID-KEY-9', 'https://api.example.com/ytmp4');
  const dv = makeCtx({});
  await downloader._ytSearchDownload(dv.ctx, 'https://youtu.be/abc', false);
  ok('video download hits the video endpoint', /api\.example\.com\/ytmp4/.test(captured || ''), captured);
  ok('video is sent', dv.sends.some((s) => s.content && s.content.video));

  captured = null;
  const da = makeCtx({});
  await downloader._ytSearchDownload(da.ctx, 'https://youtu.be/abc', true);
  ok('audio download hits the song endpoint', /api\.example\.com\/ytmp3/.test(captured || ''), captured);
  ok('audio is sent', da.sends.some((s) => s.content && s.content.audio));

  // 8) fallback to the generic `youtube` service
  apikeys.remove('song'); apikeys.remove('video');
  apikeys.set('youtube', 'YT-KEY', 'https://api.example.com/yt');
  captured = null;
  const dy = makeCtx({});
  await downloader._ytSearchDownload(dy.ctx, 'https://youtu.be/abc', true);
  ok('falls back to the youtube service', /api\.example\.com\/yt(\?|&)/.test(captured || ''), captured);

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
