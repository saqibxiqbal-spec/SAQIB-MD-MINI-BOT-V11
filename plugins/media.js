/**
 * MEDIA — sticker, toimg, tomp3, toptt, audio effects (ffmpeg-based)
 */
const config = require('../config');
const { downloadMedia } = require('../lib/helpers');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmp = (ext) => path.join(os.tmpdir(), `saqibmd_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { timeout: 90000, maxBuffer: 1024 * 1024 * 50 }, (e, so, se) => (e ? rej(new Error((se || e.message).slice(0, 200))) : res())));

/** Unwrap view-once wrappers into the inner media message. */
const unwrap = (qm) => qm?.viewOnceMessage?.message || qm?.viewOnceMessageV2?.message || qm?.viewOnceMessageV2Extension?.message || qm;

const handler = async (ctx) => {
  const { command } = ctx;

  // ---------- .sticker ----------
  if (command === 'sticker' || command === 's') {
    const own = unwrap(ctx.m.message);
    const msg = (own.imageMessage || own.videoMessage) ? own : unwrap(ctx.quoted?.message);
    if (!msg || (!msg.imageMessage && !msg.videoMessage)) {
      return ctx.reply(`❌ Image/video do. Media bhejo caption me ${config.PREFIX}sticker likh ke, ya media par reply karo.`);
    }
    const isVideo = !!msg.videoMessage;
    const buf = await downloadMedia(isVideo ? msg.videoMessage : msg.imageMessage, isVideo ? 'video' : 'image');
    const inp = tmp(isVideo ? 'mp4' : 'jpg');
    const out = tmp('webp');
    fs.writeFileSync(inp, buf);
    try {
      await run('ffmpeg', isVideo
        ? ['-y', '-i', inp, '-t', '10', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2,fps=12', '-an', '-c:v', 'libwebp', '-quality', '80', out]
        : ['-y', '-i', inp, '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2', '-c:v', 'libwebp', '-quality', '85', out]);
      await ctx.sendSticker(fs.readFileSync(out), isVideo);
    } catch (e) {
      await ctx.reply('❌ Sticker banane me error: ' + e.message);
    } finally {
      [inp, out].forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
    }
    return;
  }

  // ---------- .toimg : sticker -> image ----------
  if (command === 'toimg' || command === 'toimage') {
    const own = unwrap(ctx.m.message);
    const msg = own.stickerMessage ? own : unwrap(ctx.quoted?.message);
    if (!msg?.stickerMessage) return ctx.reply('❌ Kisi sticker par reply karo.');
    const buf = await downloadMedia(msg.stickerMessage, 'sticker');
    const inp = tmp('webp');
    const out = tmp('png');
    fs.writeFileSync(inp, buf);
    try {
      await run('ffmpeg', ['-y', '-i', inp, out]);
      await ctx.send(ctx.from, { image: fs.readFileSync(out), caption: `🖼️ *${config.BOT_NAME}*` }, { quoted: ctx.m });
    } catch (e) {
      await ctx.reply('❌ Convert error: ' + e.message);
    } finally {
      [inp, out].forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
    }
    return;
  }

  // ---------- .tomp3 / .toptt ----------
  if (command === 'tomp3' || command === 'toptt') {
    const ownA = unwrap(ctx.m.message);
    const qA = unwrap(ctx.quoted?.message);
    const msg = ownA.audioMessage || ownA.videoMessage || qA?.audioMessage || qA?.videoMessage;
    if (!msg) return ctx.reply(`❌ Audio/voice/video par reply karo.`);
    const isVideo = !!((ctx.m.message.videoMessage) || (ctx.quoted?.message?.videoMessage));
    const buf = await downloadMedia(msg, isVideo ? 'video' : 'audio');
    const inp = tmp('bin');
    fs.writeFileSync(inp, buf);
    const out = tmp(command === 'toptt' ? 'ogg' : 'mp3');
    try {
      await run('ffmpeg', command === 'toptt'
        ? ['-y', '-i', inp, '-vn', '-c:a', 'libopus', '-b:a', '64k', out]
        : ['-y', '-i', inp, '-vn', '-c:a', 'libmp3lame', '-q:a', '4', out]);
      if (command === 'toptt') await ctx.send(ctx.from, { audio: fs.readFileSync(out), mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: ctx.m });
      else await ctx.send(ctx.from, { document: fs.readFileSync(out), mimetype: 'audio/mpeg', fileName: `saqibmd_${command}.mp3` }, { quoted: ctx.m });
    } catch (e) {
      await ctx.reply('❌ Convert error: ' + e.message);
    } finally {
      [inp, out].forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
    }
    return;
  }

  // ---------- audio effects ----------
  const fx = config.AUDIO_FX[command];
  if (fx) {
    const ownA = unwrap(ctx.m.message);
    const qA = unwrap(ctx.quoted?.message);
    const msg = ownA.audioMessage || ownA.videoMessage || qA?.audioMessage || qA?.videoMessage;
    if (!msg) return ctx.reply(`❌ Audio/voice note par reply karo.`);
    const isVideo = !!((ctx.m.message.videoMessage) || (ctx.quoted?.message?.videoMessage));
    const buf = await downloadMedia(msg, isVideo ? 'video' : 'audio');
    const inp = tmp('bin');
    fs.writeFileSync(inp, buf);
    const out = tmp('mp3');
    try {
      await run('ffmpeg', ['-y', '-i', inp, '-af', fx, '-vn', '-c:a', 'libmp3lame', '-q:a', '4', out]);
      await ctx.send(ctx.from, { audio: fs.readFileSync(out), mimetype: 'audio/mpeg' }, { quoted: ctx.m });
    } catch (e) {
      await ctx.reply('❌ Effect error: ' + e.message);
    } finally {
      [inp, out].forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
    }
    return;
  }
};

module.exports = {
  commands: ['sticker', 's', 'toimg', 'toimage', 'tomp3', 'toptt', ...Object.keys(config.AUDIO_FX)],
  category: '🛠️ MEDIA & FX',
  handler,
};
