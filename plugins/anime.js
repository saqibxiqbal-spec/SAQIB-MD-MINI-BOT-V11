/**
 * ANIME — anime image APIs (nekos.best, keyless) + dog/cat
 */
const config = require('../config');
const { getJSON } = require('../lib/helpers');

// Image categories -> nekos.best endpoint
const NEKO = {
  waifu: 'waifu',
  neko: 'neko',
  shinobu: 'neko',
  megumin: 'neko',
  awoo: 'kitsune',
  maid: 'waifu',
  anime: 'waifu',
  animegirl: 'waifu',
  garl: 'waifu',
  husbando: 'husbando',
  kitsune: 'kitsune',
};

async function nekoImage(cat) {
  const r = await getJSON(`https://nekos.best/api/v2/${cat}`);
  return r?.results?.[0]?.url || null;
}

const handler = async (ctx) => {
  const { command, reply } = ctx;

  if (command === 'dog') {
    try {
      const r = await getJSON('https://dog.ceo/api/breeds/image/random');
      await ctx.send(ctx.from, { image: { url: r.message }, caption: `🐶 ${config.BOT_NAME}` }, { quoted: ctx.m });
    } catch { await reply('❌ Image nahi mili.'); }
    return;
  }
  if (command === 'cat') {
    try {
      const r = await getJSON('https://api.thecatapi.com/v1/images/search');
      await ctx.send(ctx.from, { image: { url: r[0].url }, caption: `🐱 ${config.BOT_NAME}` }, { quoted: ctx.m });
    } catch { await reply('❌ Image nahi mili.'); }
    return;
  }

  if (NEKO[command]) {
    try {
      const url = await nekoImage(NEKO[command]);
      if (!url) throw new Error('no image');
      await ctx.send(ctx.from, { image: { url }, caption: `🌸 ${config.BOT_NAME}` }, { quoted: ctx.m });
    } catch { await reply('❌ Image nahi mili.'); }
    return;
  }
};

module.exports = {
  commands: [...Object.keys(NEKO), 'dog', 'cat'],
  category: '🌸 ANIME',
  handler,
};
