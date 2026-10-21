/**
 * BOTPIC — let the owner change the bot's MENU picture themselves
 * ---------------------------------------------------------------
 * Reply to an image (or send an image with the command) and the bot saves it to
 * the volume and uses it for `.menu` from then on. The choice persists across
 * restarts and redeploys (it is written next to the session data and recorded
 * in saqib-settings.json).
 *
 *   .botpic            -> show how to set it + the current file name
 *   .botpic reset      -> go back to the bundled default picture
 *   (reply to an image) .botpic -> save that image as the menu picture
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const settings = require('../lib/settings');
const helpers = require('../lib/helpers');

// Volume-backed path (same directory as saqib-settings.json / the session dir),
// so the picture survives redeploys.
const PIC_FILE = path.join(path.dirname(path.resolve(config.SESSION_DIR)), 'botpic.jpg');
const DEFAULT_PIC = process.env.BOT_PIC || './assets/bot.jpg';

/** Pull an imageMessage out of the replied-to message or the current message. */
function imageFrom(ctx) {
  const unwrap = (msg) => {
    if (!msg) return null;
    return (
      msg.imageMessage ||
      msg.viewOnceMessage?.message?.imageMessage ||
      msg.viewOnceMessageV2?.message?.imageMessage ||
      msg.viewOnceMessageV2Extension?.message?.imageMessage ||
      null
    );
  };
  return unwrap(ctx.quoted?.message) || unwrap(ctx.m?.message);
}

const handler = async (ctx) => {
  const { reply, arg } = ctx;
  const sub = String(arg || '').trim().toLowerCase();

  if (sub === 'reset') {
    config.BOT_PIC = DEFAULT_PIC;
    settings.save();
    try { require('./main').resetBotPic && require('./main').resetBotPic(); } catch { /* ignore */ }
    return reply('✅ Bot menu picture default par wapas aa gayi.');
  }

  const img = imageFrom(ctx);
  if (!img) {
    return reply(
      '🖼️ *Bot menu picture*\n\n' +
      'Kisi *image* par reply karke *' + config.PREFIX + 'botpic* bhejo — wohi pic menu me lag jayegi.\n\n' +
      `_Abhi:_ ${path.basename(config.BOT_PIC)}\n` +
      `_Default par wapas:_ ${config.PREFIX}botpic reset`
    );
  }

  try {
    const buf = await helpers.downloadMedia(img, 'image');
    if (!buf || !buf.length) throw new Error('image khali hy');
    fs.mkdirSync(path.dirname(PIC_FILE), { recursive: true });
    fs.writeFileSync(PIC_FILE, buf);
    config.BOT_PIC = PIC_FILE;
    settings.save();
    // Drop the in-memory menu-pic cache so the NEXT `.menu` uses the new image.
    try { require('./main').resetBotPic && require('./main').resetBotPic(); } catch { /* ignore */ }
    await reply(`✅ Bot menu picture update ho gayi! Ab *${config.PREFIX}menu* me yehi pic aayegi.`);
  } catch (e) {
    await reply(`❌ Pic save nahi ho saki: ${e?.message || e}`);
  }
};

module.exports = {
  commands: ['botpic', 'setbotpic', 'menupic'],
  category: '⚙️ SETTINGS',
  ownerOnly: true,
  handler,
};
