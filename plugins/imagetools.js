/**
 * IMAGE TOOLS — upscale / enhance / unblur / removebg / remini / colorize
 * ----------------------------------------------------------------------
 * Reply to an image (or send it with a caption) and the bot returns the
 * processed image. Powered by ffmpeg (no external API key needed).
 *
 *   upscale1-16   resize by Nx (lanczos)
 *   enhance1/4/8/16  resize by Nx + sharpening
 *   unblur        unsharp mask
 *   blurface      box blur
 *   removebg      make near-white background transparent (colorkey)
 *   removebg2     stronger background removal
 *   remini        "HD" enhance (2x + sharpen + contrast)
 *   colorize      boost saturation / contrast
 */
const config = require('../config');
const { downloadMedia } = require('../lib/helpers');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmp = (ext) => path.join(os.tmpdir(), `saqibimg_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
const run = (args) => new Promise((res, rej) => execFile('ffmpeg', args, { timeout: 90000, maxBuffer: 1024 * 1024 * 50 }, (e, so, se) => (e ? rej(new Error((se || e.message).slice(0, 200))) : res())));

function filterFor(command) {
  let m;
  if ((m = /^upscale(\d+)$/.exec(command))) {
    const n = Math.min(16, Math.max(1, parseInt(m[1], 10)));
    return { vf: `scale=iw*${n}:ih*${n}:flags=lanczos`, ext: 'png', label: `Upscale ${n}x` };
  }
  if ((m = /^enhance(\d+)$/.exec(command))) {
    const n = Math.min(16, Math.max(1, parseInt(m[1], 10)));
    return { vf: `scale=iw*${n}:ih*${n}:flags=lanczos,unsharp=5:5:1.2:5:5:0`, ext: 'png', label: `Enhance ${n}x` };
  }
  switch (command) {
    case 'unblur': return { vf: 'unsharp=7:7:2.0:7:7:0', ext: 'png', label: 'Unblur' };
    case 'blurface': return { vf: 'boxblur=8:2', ext: 'png', label: 'Blur' };
    case 'removebg': return { vf: 'colorkey=white:0.30:0.20', ext: 'png', label: 'Remove BG' };
    case 'removebg2': return { vf: 'colorkey=0xFFFFFF:0.45:0.10', ext: 'png', label: 'Remove BG Pro' };
    case 'remini': return { vf: 'scale=iw*2:ih*2:flags=lanczos,unsharp=5:5:1.5:5:5:0,eq=contrast=1.08:saturation=1.1', ext: 'png', label: 'Remini HD' };
    case 'colorize': return { vf: 'eq=saturation=1.8:contrast=1.1:brightness=0.03', ext: 'png', label: 'Colorize' };
    default: return null;
  }
}

const handler = async (ctx) => {
  const { command, reply } = ctx;
  const spec = filterFor(command);
  if (!spec) return reply('\u2753 Unknown image tool');

  const msg = ctx.m.message.imageMessage ? ctx.m.message : ctx.quoted?.message;
  if (!msg?.imageMessage) return reply(`\u274c Kisi image par reply karo ya caption me ${config.PREFIX}${command} likho.`);

  const buf = await downloadMedia(msg.imageMessage, 'image');
  const inp = tmp('jpg');
  const out = tmp(spec.ext);
  fs.writeFileSync(inp, buf);
  try {
    await run(['-y', '-i', inp, '-vf', spec.vf, out]);
    await ctx.send(ctx.from, {
      image: fs.readFileSync(out),
      caption: `\ud83d\uddbc\ufe0f *${spec.label}*\n\ud83d\udc51 ${config.BOT_NAME}`,
    }, { quoted: ctx.m });
  } catch (e) {
    await reply('\u274c Process error: ' + e.message);
  } finally {
    [inp, out].forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
  }
};

const commands = [];
for (let i = 1; i <= 16; i++) commands.push(`upscale${i}`);
commands.push('unblur', 'blurface', 'removebg', 'removebg2', 'remini');
// Register EVERY enhance level (1–16). Previously only 1/4/8/16 were registered
// here while enhance2/enhance3 lived in edit.js — where they were never handled,
// so `.enhance2` fell through to a "not available" message. filterFor() already
// understands any enhanceN, so we simply expose all of them here.
for (let i = 1; i <= 16; i++) commands.push(`enhance${i}`);
commands.push('colorize');

module.exports = {
  commands,
  category: '\ud83d\udcf8 IMAGE TOOLS',
  handler,
};
