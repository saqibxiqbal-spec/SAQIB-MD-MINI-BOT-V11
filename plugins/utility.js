/**
 * UTILITY / OTHER — misc commands
 *   fetch, ping2, mee, srepo, gpass, getlid, url, getimage, raw2, structure,
 *   cpp, convert, caption, anime1-5, unban0-99
 */
const config = require('../config');
const crypto = require('crypto');
const { getJSON, getText, downloadMedia, formatDuration } = require('../lib/helpers');

const startAt = Date.now();
const isUrl = (s) => /^https?:\/\//i.test(s || '');

/* ---- unit converter (length / weight / temperature) ---- */
const UNITS = {
  // length -> meters
  m: ['length', 1], km: ['length', 1000], cm: ['length', 0.01], mm: ['length', 0.001],
  mi: ['length', 1609.34], mile: ['length', 1609.34], miles: ['length', 1609.34],
  ft: ['length', 0.3048], feet: ['length', 0.3048], inch: ['length', 0.0254], in: ['length', 0.0254],
  yd: ['length', 0.9144], yard: ['length', 0.9144],
  // weight -> grams
  g: ['weight', 1], kg: ['weight', 1000], mg: ['weight', 0.001], lb: ['weight', 453.592],
  lbs: ['weight', 453.592], pound: ['weight', 453.592], oz: ['weight', 28.3495], ton: ['weight', 1e6],
};
function convertUnit(amount, from, to) {
  from = from.toLowerCase(); to = to.toLowerCase();
  if (from === 'c' || from === 'celsius') {
    if (to === 'f' || to === 'fahrenheit') return amount * 9 / 5 + 32;
    if (to === 'k' || to === 'kelvin') return amount + 273.15;
    return amount;
  }
  if (from === 'f' || from === 'fahrenheit') {
    if (to === 'c' || to === 'celsius') return (amount - 32) * 5 / 9;
    if (to === 'k' || to === 'kelvin') return (amount - 32) * 5 / 9 + 273.15;
    return amount;
  }
  const a = UNITS[from], b = UNITS[to];
  if (!a || !b || a[0] !== b[0]) return null;
  return amount * a[1] / b[1];
}

async function nekoImg(cat) {
  try {
    const r = await getJSON(`https://nekos.best/api/v2/${cat}`);
    return r?.results?.[0]?.url || null;
  } catch { return null; }
}

const handler = async (ctx) => {
  const { command, reply, arg } = ctx;

  // ---- unban0 .. unban99 ----
  const ub = /^unban(\d+)$/.exec(command);
  if (ub) {
    const n = ub[1];
    const who = ctx.quoted ? (ctx.quoted.key.participant || '').split('@')[0] : null;
    const tag = who ? `@${who}` : (arg ? `+${arg.replace(/[^0-9]/g, '')}` : ctx.pushname);
    const mentions = who ? [who + '@s.whatsapp.net'] : [];
    await reply(`\u2705 *UNBAN ${n}* \u2014 ${tag} ko unban kar diya gaya! \ud83d\udd13\n\ud83d\udc51 ${config.BOT_NAME}`, { mentions });
    return;
  }

  // ---- anime1 .. anime5 ----
  const an = /^anime([1-5])$/.exec(command);
  if (an) {
    const cats = { 1: 'waifu', 2: 'neko', 3: 'husbando', 4: 'kitsune', 5: 'maid' };
    const cat = cats[an[1]];
    const url = await nekoImg(cat);
    if (!url) return reply('\u274c Anime image nahi mili, dobara try karo.');
    await ctx.send(ctx.from, { image: { url }, caption: `\ud83c\udf38 *${cat.toUpperCase()}*\n\ud83d\udc51 ${config.BOT_NAME}` }, { quoted: ctx.m });
    return;
  }

  switch (command) {
    case 'fetch': {
      if (!isUrl(arg)) return reply(`\u274c URL do. Example: ${config.PREFIX}fetch https://api.github.com`);
      try {
        const t = await getText(arg);
        await reply(`\ud83c\udf10 *Fetch* \u2014 ${arg}\n\n${t.slice(0, 1500)}${t.length > 1500 ? '\n\u2026' : ''}`);
      } catch { await reply('\u274c Fetch fail.'); }
      break;
    }
    case 'ping2': {
      const t0 = Date.now();
      await reply('\ud83c\udfd3 Pong!');
      await reply(`\ud83c\udfd3 *Pong!*\n\u26a1 Speed: *${Date.now() - t0}ms*\n\u23f1\ufe0f Uptime: ${formatDuration(Date.now() - startAt)}`);
      break;
    }
    case 'mee':
      await reply(`\ud83e\udd16 *${config.BOT_NAME} v${config.BOT_VERSION}*\n\ud83d\udc51 Owner: ${config.OWNER_NAME}\n\u26a1 Prefix: "${config.PREFIX}"\n\ud83c\udf10 Mode: ${config.MODE}\n\u23f1\ufe0f Uptime: ${formatDuration(Date.now() - startAt)}\n\n_Type ${config.PREFIX}menu for all commands._`);
      break;
    case 'srepo':
      await reply(`\ud83d\udce6 *${config.BOT_NAME}* \u2014 WhatsApp Bot\n\ud83d\udd17 ${config.REPO_LINK}`);
      break;
    case 'gpass': {
      const len = Math.min(64, Math.max(8, parseInt(arg) || 14));
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      let pw = '';
      for (let i = 0; i < len; i++) pw += chars[crypto.randomInt(chars.length)];
      await reply(`\ud83d\udd11 *Password (${len}):*\n\n\`${pw}\``);
      break;
    }
    case 'getlid': {
      const who = ctx.quoted ? (ctx.quoted.key.participant || ctx.quoted.key.remoteJid) : ctx.sender;
      await reply(`\ud83c\udd94 *JID:* ${who}\n\ud83d\udc64 *Number:* +${(who || '').split('@')[0].split(':')[0]}`);
      break;
    }
    case 'url': {
      const media = ctx.m.message?.imageMessage || ctx.m.message?.videoMessage || ctx.quoted?.message?.imageMessage || ctx.quoted?.message?.videoMessage;
      if (!media) return reply(`\u274c Kisi image/video par reply karo.`);
      try {
        const type = ctx.m.message?.imageMessage || ctx.quoted?.message?.imageMessage ? 'image' : 'video';
        const buf = await downloadMedia(media, type);
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', new Blob([buf]), type === 'image' ? 'image.jpg' : 'video.mp4');
        const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
        const url = (await res.text()).trim();
        if (!url.startsWith('http')) throw new Error('upload fail');
        await reply(`\ud83d\udd17 *URL:* ${url}`);
      } catch { await reply('\u274c Upload fail ho gaya.'); }
      break;
    }
    case 'getimage': {
      if (!isUrl(arg)) return reply(`\u274c Image URL do. Example: ${config.PREFIX}getimage https://...jpg`);
      await ctx.send(ctx.from, { image: { url: arg }, caption: `\ud83d\uddbc\ufe0f ${config.BOT_NAME}` }, { quoted: ctx.m });
      break;
    }
    case 'raw2': {
      const target = ctx.quoted || ctx.m;
      await reply(`\ud83e\uddfe *Raw message:*\n\n\`\`\`${JSON.stringify(target.message || target, null, 1).slice(0, 1500)}\`\`\``);
      break;
    }
    case 'structure': {
      const cats = {};
      for (const p of require('./_registry').all()) {
        const c = p.category || 'OTHER';
        cats[c] = (cats[c] || 0) + p.commands.length;
      }
      const total = Object.values(cats).reduce((a, b) => a + b, 0);
      const body = Object.entries(cats).map(([c, n]) => `\u25b9 ${c}: *${n}*`).join('\n');
      await reply(`\ud83d\uddc2\ufe0f *${config.BOT_NAME} Structure*\n\n${body}\n\n\u2500 Total: *${total}* commands`);
      break;
    }
    case 'cpp': {
      const a = ctx.senderNum;
      const b = ctx.quoted ? (ctx.quoted.key.participant || '').split('@')[0].split(':')[0] : (arg ? arg.replace(/[^0-9]/g, '') : null);
      if (!b) return reply(`\u274c Kisi ko reply karo ya number do. Example: ${config.PREFIX}cpp 923001234567`);
      const seed = [a, b].sort().join('');
      let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 1000;
      const pct = h % 101;
      const bar = '\u2588'.repeat(Math.round(pct / 10)).padEnd(10, '\u2591');
      await reply(`\ud83d\udc98 *Couple Percentage*\n\n+${a} \u2764\ufe0f +${b}\n${bar} *${pct}%*\n\n${pct > 75 ? '\ud83d\ude0d Perfect match!' : pct > 50 ? '\ud83d\ude0a Achi jodi hy!' : pct > 25 ? '\ud83d\ude10 Thoda kaam hy.' : '\ud83d\ude05 Mushkil hy!'}`);
      break;
    }
    case 'convert': {
      const [amountStr, from, to] = arg.split(/\s+/);
      const amount = parseFloat(amountStr);
      if (!amountStr || !from || !to || isNaN(amount)) return reply(`\u274c Format: ${config.PREFIX}convert 10 km mi`);
      const r = convertUnit(amount, from, to);
      if (r === null) return reply('\u274c Ye units support nahi hain (length/weight/temp try karo).');
      await reply(`\ud83d\udcd0 *${amount} ${from} = ${r.toFixed(4).replace(/\.?0+$/, '')} ${to}*`);
      break;
    }
    case 'caption': {
      const msg = ctx.m.message?.imageMessage || ctx.m.message?.videoMessage || ctx.quoted?.message?.imageMessage || ctx.quoted?.message?.videoMessage;
      const cap = msg?.caption;
      if (!cap) return reply('\u274c Kisi captioned image/video par reply karo.');
      await reply(`\ud83d\udcdd *Caption:*\n\n${cap}`);
      break;
    }
    default:
      await reply('\u2753 Unknown utility command');
  }
};

const commands = ['fetch', 'ping2', 'mee', 'srepo', 'gpass', 'getlid', 'url', 'getimage', 'raw2', 'structure', 'cpp', 'convert', 'caption'];
for (let i = 1; i <= 5; i++) commands.push(`anime${i}`);
for (let i = 0; i <= 99; i++) commands.push(`unban${i}`);

module.exports = {
  commands,
  category: '🔧 UTILITY',
  handler,
};
