/**
 * REACTIONS — action commands (hug, pat, kiss, slap, …)
 * -----------------------------------------------------
 * Uses nekos.best for animated GIFs where available, and falls back to a
 * fun emoji reaction for the rest. Mentions the replied-to user.
 */
const config = require('../config');
const { getJSON, targetOf } = require('../lib/helpers');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * GIF FIX: nekos.best returns animated .gif files. Sending a raw .gif as a
 * WhatsApp "video" fails on many clients, so we download the gif and remux it
 * to a tiny mp4 with ffmpeg, then send it with gifPlayback:true. If ffmpeg is
 * unavailable we fall back to sending the gif URL directly.
 */
const ff = (args) => new Promise((res, rej) =>
  execFile('ffmpeg', args, { timeout: 60000, maxBuffer: 1024 * 1024 * 64 }, (e) => (e ? rej(e) : res())));

async function gifToMp4(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('gif fetch failed');
  const buf = Buffer.from(await r.arrayBuffer());
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inp = path.join(os.tmpdir(), `gif_${id}.gif`);
  const out = path.join(os.tmpdir(), `gif_${id}.mp4`);
  fs.writeFileSync(inp, buf);
  try {
    await ff(['-y', '-i', inp, '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', '-crf', '28', out]);
    return fs.readFileSync(out);
  } finally {
    [inp, out].forEach((f) => { try { fs.existsSync(f) && fs.unlinkSync(f); } catch { /* ignore */ } });
  }
}

// Commands that have a nekos.best GIF endpoint
const GIF_ACTIONS = [
  'hug', 'pat', 'kiss', 'slap', 'cuddle', 'wink', 'smile', 'dance', 'bite', 'bonk',
  'highfive', 'handhold', 'poke', 'wave', 'blush', 'smug', 'happy', 'think', 'feed',
  'tickle', 'laugh', 'baka', 'nod', 'nom', 'nope', 'pout', 'shrug', 'sleep', 'stare',
  'thumbsup', 'wag', 'punch', 'lurk', 'yeet',
];

// Emoji-only reactions
const EMOJI = {
  cry: '😭', angry: '😠', sad: '😔', confused: '😕', bored: '🥱', yawn: '🥱',
  shocked: '😱', scared: '😨', shy: '😊', cool: '😎', celebrate: '🎉', run: '🏃',
  walk: '🚶', facepalm: '🤦', clap: '👏', salute: '🫡', yes: '✅', no: '❌',
  sorry: '🙏', shake: '🤝', handshake: '🤝', peck: '😘', sip: '☕', tehee: '😁',
  bleh: '😝', nya: '🐱', carry: '🫂', kabedon: '😳', spin: '💫', blowkiss: '😘',
  tableflip: '🤬', stop: '✋', surprised: '😲', tired: '😩', sigh: '😮‍💨',
  nuzzle: '🥰', yay: '🥳', headbang: '🤘', nosebleed: '🩸', bully: '😈',
  cringe: '😬', kill: '🔪', glomp: '🤗', shoot: '🔫', marige: '💍', flirt: '😉',
  blush2: '😊', hold: '🫂', blushhard: '😳',
};

async function nekoGif(cat) {
  const r = await getJSON(`https://nekos.best/api/v2/${cat}`);
  return r?.results?.[0]?.url || null;
}

const handler = async (ctx) => {
  const { command, reply } = ctx;
  // Resolve the replied-to user through the LID resolver so we never mention a
  // fake number (raw LIDs like 212223345675336@lid used to leak here).
  const target = targetOf(ctx);
  const tag = target ? `@${target.num}` : 'tum';
  const mentions = target ? [target.jid] : [];

  if (GIF_ACTIONS.includes(command)) {
    try {
      const url = await nekoGif(command);
      if (url) {
        const caption = `✨ ${ctx.pushname} ne *${command}* kiya ${tag} ke sath!`;
        // Download + remux the gif to mp4 so WhatsApp actually plays it.
        try {
          const mp4 = await gifToMp4(url);
          await ctx.send(ctx.from, { video: mp4, gifPlayback: true, caption, mentions }, { quoted: ctx.m });
        } catch {
          // ffmpeg unavailable / conversion failed → send the gif URL directly
          await ctx.send(ctx.from, { video: { url }, gifPlayback: true, caption, mentions }, { quoted: ctx.m });
        }
        return;
      }
    } catch { /* fall through to emoji */ }
    await ctx.send(ctx.from, { text: `${EMOJI[command] || '✨'} ${ctx.pushname} ne *${command}* kiya ${tag} ke sath!`, mentions }, { quoted: ctx.m });
    return;
  }

  if (EMOJI[command]) {
    await ctx.send(ctx.from, { text: `${EMOJI[command]} ${ctx.pushname} ne *${command}* kiya ${tag} ke sath!`, mentions }, { quoted: ctx.m });
    return;
  }

  await reply('❓ Unknown reaction');
};

module.exports = {
  commands: [...GIF_ACTIONS, ...Object.keys(EMOJI)],
  category: '🎭 REACTIONS',
  handler,
};
