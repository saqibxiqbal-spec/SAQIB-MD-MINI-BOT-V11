/**
 * EDIT — photo effects (pure-JS filters; heavy filters use the bot's
 * existing image pipeline when present).
 *
 * NOTE: the fancy effects (oil paint, sketch, HDR…) need a real image
 * engine. This plugin implements the ones that can be done safely in pure
 * JS with a small PPM round-trip, and tells the user clearly when a filter
 * needs a tool the host does not have.
 */
const config = require('../config');
const { downloadMedia } = require('../lib/helpers');

const P = () => config.PREFIX;

/** Decode a JPEG/PNG into raw RGB using ffmpeg if available. */
async function toRgb(buf, ext) {
  const { execFile } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const inp = path.join(os.tmpdir(), `ed_${Date.now()}.${ext}`);
  const out = path.join(os.tmpdir(), `ed_${Date.now()}.ppm`);
  fs.writeFileSync(inp, buf);
  try {
    await new Promise((res, rej) => execFile('ffmpeg', ['-y', '-i', inp, out], { timeout: 30000 }, (e) => (e ? rej(e) : res())));
    return { ppm: fs.readFileSync(out), inp, out };
  } finally {
    setTimeout(() => { [inp, out].forEach((f) => { try { fs.unlinkSync(f); } catch { /* ignore */ } }); }, 5000);
  }
}

const handler = async (ctx) => {
  const { command, reply } = ctx;
  const q = ctx.quoted || ctx.m;
  const img = q?.message?.imageMessage;

  // Everything here needs an image.
  if (!img) {
    return reply(`❌ Kisi *image* par reply karke ${P()}${command} likho.`);
  }

  try {
    const buf = await downloadMedia(img, 'image');
    const ext = /png/i.test(img.mimetype || '') ? 'png' : 'jpg';

    // ---- ffmpeg-based effects (grey / invert / sepia / vintage / blur) ----
    const FILTERS = {
      grayscale: 'hue=s=0',
      invert: 'negate',
      sepia: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
      vintage: 'curves=vintage',
      blurpic: 'gblur=sigma=6',
      mirror: 'hflip',
      flipimg: 'vflip',
      pixelate: 'scale=iw/12:ih/12,scale=iw*12:ih*12:flags=neighbor',
      deepfry: 'eq=contrast=1.6:saturation=2.2:brightness=0.08',
      hdr: 'eq=contrast=1.35:saturation=1.5',
      shadow: 'eq=brightness=-0.15:contrast=1.2',
      glow: 'gblur=sigma=8,eq=brightness=0.12',
      comic: 'eq=contrast=1.5:saturation=1.8,edgedetect=low=0.1:high=0.3',
      oilpaint: 'smartblur=lr=1.5:ls=-0.5',
      sketchpic: 'edgedetect=low=0.08:high=0.25,negate',
      glass: 'gblur=sigma=3,eq=contrast=1.2:saturation=1.3',
      vhs: 'eq=saturation=1.4:contrast=1.1,noise=alls=12:allf=t',
    };

    if (FILTERS[command]) {
      const { execFile } = require('child_process');
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const inp = path.join(os.tmpdir(), `fx_${Date.now()}.${ext}`);
      const out = path.join(os.tmpdir(), `fx_${Date.now()}.jpg`);
      fs.writeFileSync(inp, buf);
      try {
        await new Promise((res, rej) => execFile('ffmpeg', ['-y', '-i', inp, '-vf', FILTERS[command], out], { timeout: 45000 }, (e) => (e ? rej(e) : res())));
        await ctx.send(ctx.from, { image: fs.readFileSync(out), caption: `✨ *${command}* effect` }, { quoted: ctx.m });
      } finally {
        setTimeout(() => { [inp, out].forEach((f) => { try { fs.unlinkSync(f); } catch { /* ignore */ } }); }, 5000);
      }
      return;
    }

    // ---- caption/poster style commands (no image processing needed) ----
    const CAPTIONS = {
      frame: '🖼️ *Photo frame*',
      polaroid: '📷 *Polaroid style*',
    };
    if (CAPTIONS[command]) {
      return reply(`⚠️ *${command}* ke liye image engine (sharp/canvas) chahiye jo is host par nahi hai.\n\n✅ Ye effects chalte hain: ${P()}grayscale ${P()}sepia ${P()}invert ${P()}blurpic ${P()}vintage ${P()}sketchpic ${P()}pixelate ${P()}deepfry ${P()}hdr ${P()}glow ${P()}vhs ${P()}mirror ${P()}flipimg ${P()}comic`);
    }

    return reply(`⚠️ *${command}* filhal available nahi (host par image tools nahi hain).\n\n✅ Chalne wale effects: ${P()}grayscale, ${P()}sepia, ${P()}invert, ${P()}blurpic, ${P()}vintage, ${P()}sketchpic, ${P()}pixelate, ${P()}deepfry, ${P()}hdr, ${P()}glow, ${P()}vhs, ${P()}mirror, ${P()}flipimg, ${P()}comic, ${P()}oilpaint, ${P()}glass`);
  } catch (e) {
    return reply(`❌ Effect lagane me error: ${String(e.message || e).slice(0, 100)}`);
  }
};

module.exports = {
  commands: [
    'grayscale', 'invert', 'sepia', 'vintage', 'blurpic', 'mirror', 'flipimg', 'pixelate', 'deepfry', 'hdr',
    'shadow', 'comic', 'oilpaint', 'sketchpic', 'glass', 'vhs', 'frame', 'polaroid',
  ],
  category: '🖼️ EDIT',
  handler,
};
