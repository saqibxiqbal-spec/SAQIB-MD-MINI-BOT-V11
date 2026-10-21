/**
 * LOGO — text → logo image generation (keyless, pollinations)
 * Every style maps to a prompt flavour.
 */
const config = require('../config');
const img = require('../lib/imagegen');

const STYLES = {
  advglow: 'advanced glowing neon text effect, dark background',
  amongus: 'among us themed game logo, cartoon style',
  bplogo: 'gaming esports mascot logo, bold',
  bpstyle: 'gaming banner logo, dark, aggressive',
  cartoontxt: 'cartoon style 3d text, playful, colorful',
  deletetxt: 'erased broken text effect, grunge',
  clouds: 'text made of fluffy clouds, sky background',
  flag3d: '3d flag waving text, patriotic',
  freecreate: 'creative free style artistic text',
  galaxy: 'galaxy space themed text, stars, nebula',
  galaxywp: 'galaxy wallpaper with glowing text',
  glitch: 'glitch distortion text effect, cyberpunk',
  glow: 'glowing neon text on dark background',
  gradient: 'colorful gradient text, smooth',
  lightfx: 'light effects text, sparks, rays',
  logomaker: 'professional company logo, minimal',
  luxurygold: 'luxury gold metallic 3d text, elegant',
  neon: 'neon sign text, glowing, dark wall',
  papercut: 'paper cut out text, layered, craft',
  pixelglitch: 'pixel art glitch text, retro game',
  royal: 'royal golden crown text, majestic',
  sand: 'text written in sand on beach',
  typography: 'modern minimalist typography poster',
  beach: 'text on tropical beach, sunset',
  underwater: 'underwater text, bubbles, ocean',
  watercolor: 'watercolor paint text, artistic',
  write: 'handwritten text on paper',
};

const handler = async (ctx) => {
  const { command, reply, arg } = ctx;
  if (!arg) return reply(`❌ Text do. Example: ${config.PREFIX}${command} SAQIB MD`);
  const flavour = STYLES[command] || 'stunning 3d text logo';
  const prompt = `${arg} text logo, ${flavour}, high quality, 4k, centered`;
  await img.sendGeneratedImage(
    ctx,
    prompt,
    `🎨 *${arg}* — ${command} logo\n👑 ${config.BOT_NAME}`,
    { width: 1024, height: 1024 }
  );
};

module.exports = {
  commands: Object.keys(STYLES),
  category: '🎨 LOGO',
  handler,
};
