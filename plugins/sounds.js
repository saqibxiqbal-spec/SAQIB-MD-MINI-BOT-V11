/**
 * SOUNDS — fun sound-effect commands (sound, sound2 … sound16).
 *
 * Each command synthesises a REAL audio clip on the fly with ffmpeg's `lavfi`
 * virtual inputs (no bundled assets, no network), caches it in memory, and
 * sends it as a WhatsApp audio message. If you reply to a voice note with a
 * sound command, that note is re-sent back instead (so it always "works").
 *
 * If ffmpeg is unavailable the command degrades gracefully to a text reply.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const config = require('../config');
const { targetOf } = require('../lib/helpers');

/** ffmpeg lavfi filtergraph per sound. Verified non-silent (see scripts/test-sounds-filters.sh). */
const SOUNDS = {
  sound:   { emoji: '🔊', label: 'Beep Boop',   desc: 'classic bot beep',   filter: "aevalsrc='0.4*sin(2*PI*880*t)*between(t,0,0.12)+0.4*sin(2*PI*660*t)*between(t,0.16,0.28)':d=0.35:s=44100" },
  sound2:  { emoji: '🔔', label: 'Ding',        desc: 'notification chime', filter: "aevalsrc='0.5*sin(2*PI*1320*t)*exp(-6*t)':d=0.6:s=44100" },
  sound3:  { emoji: '🎵', label: 'Melody',      desc: 'soft melody',        filter: "aevalsrc='0.35*(sin(2*PI*523*t)*between(t,0,0.18)+sin(2*PI*659*t)*between(t,0.18,0.36)+sin(2*PI*784*t)*between(t,0.36,0.54)+sin(2*PI*1047*t)*between(t,0.54,0.75))':d=0.78:s=44100" },
  sound4:  { emoji: '💥', label: 'Boom',        desc: 'explosion hit',      filter: "aevalsrc='0.6*sin(2*PI*60*t)*exp(-4*t)+0.3*random(0)*exp(-8*t)':d=0.9:s=44100" },
  sound5:  { emoji: '⚡', label: 'Zap',         desc: 'electric zap',       filter: "aevalsrc='0.4*sin(2*PI*(2000-1500*t)*t)*exp(-3*t)':d=0.4:s=44100" },
  sound6:  { emoji: '💃', label: 'Beat Drop',   desc: 'party beat',         filter: "aevalsrc='0.6*sin(2*PI*55*t)*exp(-8*mod(t,0.3))+0.25*sin(2*PI*1000*t)*exp(-40*mod(t,0.3))':d=1.2:s=44100" },
  sound7:  { emoji: '🌊', label: 'Whoosh',      desc: 'air whoosh',         filter: "anoisesrc=d=0.5:c=pink:a=0.9,highpass=f=400,lowpass=f=6000,afade=t=in:d=0.1,afade=t=out:st=0.3:d=0.2,volume=2.2" },
  sound8:  { emoji: '🔫', label: 'Gunshot',     desc: 'pew pew',            filter: "anoisesrc=d=0.25:c=white:a=0.8,lowpass=f=3000,afade=t=out:st=0.02:d=0.23" },
  sound9:  { emoji: '🥁', label: 'Drum',        desc: 'drum roll',          filter: "aevalsrc='0.4*sin(2*PI*180*t)*exp(-30*mod(t,0.08))':d=0.8:s=44100" },
  sound10: { emoji: '🎺', label: 'Flute',       desc: 'flute tune',         filter: "aevalsrc='0.35*sin(2*PI*880*t+0.5*sin(2*PI*6*t))':d=0.8:s=44100" },
  sound11: { emoji: '🎸', label: 'Guitar',      desc: 'rock riff',          filter: "aevalsrc='0.3*(sin(2*PI*196*t)+0.5*sin(2*PI*392*t)+0.25*sin(2*PI*588*t))*exp(-2*t)':d=0.7:s=44100" },
  sound12: { emoji: '🎹', label: 'Piano',       desc: 'piano note',         filter: "aevalsrc='0.4*(sin(2*PI*440*t)+0.3*sin(2*PI*880*t))*exp(-3*t)':d=0.8:s=44100" },
  sound13: { emoji: '🚀', label: 'Launch',      desc: 'rocket launch',      filter: "aevalsrc='0.4*sin(2*PI*(100+800*t)*t)':d=1.0:s=44100" },
  sound14: { emoji: '🔨', label: 'Clank',       desc: 'metal clank',        filter: "aevalsrc='0.3*(sin(2*PI*2500*t)+sin(2*PI*3700*t))*exp(-15*t)+0.2*random(0)*exp(-25*t)':d=0.4:s=44100" },
  sound15: { emoji: '🎉', label: 'Party',       desc: 'celebration horn',   filter: "aevalsrc='0.4*(sin(2*PI*466*t)+0.5*sin(2*PI*932*t))*between(t,0,0.5)':d=0.55:s=44100" },
  sound16: { emoji: '😴', label: 'Lullaby',     desc: 'sleepy tune',        filter: "aevalsrc='0.25*(sin(2*PI*392*t)*between(t,0,0.3)+sin(2*PI*440*t)*between(t,0.3,0.6)+sin(2*PI*349*t)*between(t,0.6,0.9)+sin(2*PI*330*t)*between(t,0.9,1.3))':d=1.35:s=44100" },
};

/** In-memory cache of synthesised clips (name → Buffer). */
const cache = new Map();

/** Run ffmpeg, reject on error. */
function runFfmpeg(args, timeout = 20000) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout, maxBuffer: 1024 * 1024 * 32 }, (err, _so, se) => {
      if (err) return reject(new Error((se || err.message || 'ffmpeg failed').toString().slice(0, 200)));
      resolve();
    });
  });
}

/**
 * Synthesise (or return a cached) mp3 buffer for the given sound name.
 * Returns a Buffer, or throws if synthesis fails.
 */
async function synth(name) {
  if (cache.has(name)) return cache.get(name);
  const s = SOUNDS[name];
  if (!s) throw new Error('unknown sound');
  const stamp = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const out = path.join(os.tmpdir(), `saqib_snd_${stamp}.mp3`);
  try {
    await runFfmpeg([
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', s.filter,
      '-c:a', 'libmp3lame', '-q:a', '6', out,
    ]);
    const buf = fs.readFileSync(out);
    if (!buf.length) throw new Error('empty audio');
    cache.set(name, buf);
    return buf;
  } finally {
    try { if (fs.existsSync(out)) fs.unlinkSync(out); } catch { /* ignore */ }
  }
}

const handler = async (ctx) => {
  const { command, reply } = ctx;
  const s = SOUNDS[command];
  if (!s) return reply('❓ Unknown sound command');

  // Target (LID-safe): replied-to user, @mention, or phone number in args.
  const target = targetOf(ctx);
  const tag = target ? `@${target.num}` : (ctx.pushname || 'User');
  const mentions = target ? [target.jid] : [];
  const caption = `${s.emoji} *${s.label}* — ${s.desc}\n🎼 ${ctx.pushname} ne ${tag} ke liye sound play kiya!`;

  // 1) If replying to a voice note / audio, re-send that clip (always works).
  const qm = ctx.quoted?.message;
  const qAudio = qm?.audioMessage || qm?.voiceMessage;
  if (qAudio) {
    try {
      const { downloadMedia } = require('../lib/helpers');
      const buf = await downloadMedia(qm, 'buffer');
      if (buf && buf.length) {
        await ctx.send(ctx.from, { audio: buf, mimetype: qAudio.mimetype || 'audio/ogg; codecs=opus', ptt: !!qAudio.ptt, caption }, { quoted: ctx.m });
        return;
      }
    } catch { /* fall through to synth */ }
  }

  // 2) Synthesise a real clip and send it as audio.
  try {
    const buf = await synth(command);
    await ctx.send(ctx.from, { audio: buf, mimetype: 'audio/mpeg', ptt: false, caption }, { quoted: ctx.m });
  } catch {
    // 3) Graceful fallback — text only.
    await reply(caption, { mentions });
  }
};

module.exports = {
  commands: Object.keys(SOUNDS),
  category: '🎵 SOUNDS',
  handler,
  SOUNDS,
  synth,
};
