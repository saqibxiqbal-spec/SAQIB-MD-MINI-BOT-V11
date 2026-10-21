/**
 * MAIN — menu, help, menuall, ping, alive, uptime, owner, id, getpp,
 *        githubstalk, define, yts, praytime, runtime, repo, clear
 *
 * MENU SYSTEM
 *   .menu              -> shows all CATEGORIES (with the bot picture)
 *   .menu <category>   -> shows every command of that category
 *   .menuall           -> shows every category + every command
 */
const config = require('../config');
const path = require('path');
const fs = require('fs');
const { getJSON, formatDuration } = require('../lib/helpers');
const { msgStore, aiCache } = require('../lib/cache');
const menuReply = require('../lib/menuReply');
const fonts = require('./fonts');

const startAt = Date.now();

/* ------------------------------ menu helpers ------------------------------ */
// SPEED: plugins load once, so the category map + menu texts are memoized
// instead of being rebuilt (956 commands) on every single message.
let _cats = null;
function categories() {
  if (_cats) return _cats;
  const map = new Map();
  for (const p of require('./_registry').all()) {
    if (p.hidden) continue;
    const cat = p.category || 'OTHER';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(...p.commands);
  }
  _cats = map;
  return map;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean);

// Friendly aliases so users can type `.menu dl`, `.menu grp`, etc.
const ALIASES = {
  dl: 'download', down: 'download', media: 'media', fx: 'media',
  grp: 'group', gc: 'group', cfg: 'settings', setting: 'settings', config: 'settings',
  owner: 'owner', main: 'main', ai: 'ai', fun: 'fun', tools: 'tools',
  anime: 'anime', logo: 'logo', premium: 'premium', download: 'download',
};

/** Resolve a user query to a category display-name (precise — no false hits). */
function findCategory(query) {
  const cats = categories();
  const q = norm(ALIASES[norm(query)] || query);
  if (!q) return null;
  const keys = [...cats.keys()];
  // 1) exact normalised match  (".menu main" -> MAIN, never AI)
  let hit = keys.find((c) => norm(c) === q);
  if (hit) return hit;
  // 2) the query is a whole word of the category  (".menu media" -> MEDIA & FX)
  hit = keys.find((c) => words(c).includes(q));
  if (hit) return hit;
  // 3) prefix match — only when BOTH sides are >= 3 chars, so a 2-letter name
  //    like "ai" can never swallow an unrelated query such as "main".
  hit = keys.find((c) => { const n = norm(c); return Math.min(n.length, q.length) >= 3 && (n.startsWith(q) || q.startsWith(n)); });
  if (hit) return hit;
  // 4) substring match, same length guard
  hit = keys.find((c) => { const n = norm(c); return n.length >= 3 && q.length >= 3 && (n.includes(q) || q.includes(n)); });
  return hit || null;
}

/** A premium, modern header — a compact box that reads beautifully on a phone. */
function header() {
  let name = config.BOT_NAME;
  try { name = fonts.applyDefault(config.BOT_NAME); } catch { /* keep plain */ }
  const when = new Date().toLocaleTimeString('en-PK', { timeZone: config.TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true });
  return (
    `╭━━━━━━━━━━━━━━━━━━━━━╮\n` +
    `┃   ✦  *${name}*  ✦\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━╯\n` +
    `  ⚡ *v${config.BOT_VERSION}*  •  👑 ${config.OWNER_NAME}  •  🕒 ${when}\n` +
    `  💠 Prefix: *${config.PREFIX}*`
  );
}

/**
 * Send a menu WITH the bot's DP (profile picture) — every menu carries the DP.
 *   - Short menu (fits WhatsApp's 1024-char caption): DP + full menu in ONE msg.
 *   - Long menu: DP first (with a short caption), then the text menu below it.
 *   - No DP on disk: plain text (never fails).
 */
// SPEED: the pic is read once, but keyed by path+mtime so that changing it live
// (the `.botpic` command) is picked up on the very next menu — no restart.
let _picCache = { key: null, buf: null };
function resetBotPic() { _picCache = { key: null, buf: null }; }
function botPicBuffer() {
  const pic = path.resolve(config.BOT_PIC);
  try {
    if (!fs.existsSync(pic)) return null;
    const st = fs.statSync(pic);
    const key = pic + '|' + st.mtimeMs + '|' + st.size;
    if (_picCache.key !== key) _picCache = { key, buf: fs.readFileSync(pic) };
    return _picCache.buf;
  } catch { return null; }
}
async function sendMenu(ctx, text, opts = {}) {
  const buf = botPicBuffer();
  // 1) DP + full menu in ONE message when the caption fits.
  if (buf && text.length <= 1024) {
    try {
      await ctx.send(ctx.from, { image: buf, caption: text }, { quoted: ctx.m });
      return;
    } catch { /* fall through to the split form */ }
  }
  // 2) Long menu: send the DP on its own (short caption), then the text menu.
  if (buf) {
    try {
      const cap = opts.caption || `📂 *${config.BOT_NAME}* • 🔎 Menu`;
      await ctx.send(ctx.from, { image: buf, caption: cap }, { quoted: ctx.m });
    } catch { /* ignore — still send the text below */ }
  }
  await ctx.reply(text);
}

// SPEED: menu texts change only when the date (in the header) rolls over.
const _menuCache = new Map();
const _today = () => new Date().toISOString().slice(0, 10);
function cached(key, build) {
  const k = _today() + '|' + key;
  if (!_menuCache.has(k)) _menuCache.set(k, build());
  return _menuCache.get(k);
}

function categoriesText() {
  return cached('cats', () => {
    const cats = categories();
    const total = [...cats.values()].reduce((n, c) => n + c.length, 0);
    const bar = '━'.repeat(21);
    let txt = `${header()}\n\n`;
    txt += `📂 *CATEGORIES*   ›   ${total} commands\n${bar}\n`;
    let i = 1;
    for (const [cat, cmds] of cats.entries()) {
      txt += ` ${String(i).padStart(2, '0')} ▸ ${cat}  ›  ${cmds.length}\n`;
      i++;
    }
    txt += `${bar}\n`;
    txt += `💡 ${config.PREFIX}menu <category>   •   ${config.PREFIX}menuall\n`;
    txt += `📢 ${config.PREFIX}channel  •  👥 ${config.PREFIX}group  •  ✨ _${config.BOT_NAME}_`;
    return txt;
  });
}

function categoryText(cat) {
  return cached('cat|' + cat, () => {
    const cmds = categories().get(cat) || [];
    const p = config.PREFIX;
    let txt = `${header()}\n\n`;
    txt += `╭─❖ ${cat}\n`;
    txt += `│ 📦 *${cmds.length} commands*\n`;
    txt += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`;
    // two commands per line when they are short, so the list is half as long
    const rows = [];
    for (let i = 0; i < cmds.length; i += 2) {
      const a = `▸ ${p}${cmds[i]}`;
      const b = cmds[i + 1] ? `▸ ${p}${cmds[i + 1]}` : '';
      rows.push(b ? `${a.padEnd(26)}${b}` : a);
    }
    txt += rows.join('\n');
    txt += `\n\n╭─❖ 💡 *MORE*\n`;
    txt += `│ ▸ ${p}menu — categories\n│ ▸ ${p}menuall — saari commands\n`;
    txt += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`;
    txt += `📢 ${config.PREFIX}channel  •  👥 ${config.PREFIX}group  •  ✨ _${config.BOT_NAME}_`;
    return txt;
  });
}

function allText() {
  return cached('all', () => {
    const cats = categories();
    let txt = `${header()}\n\n`;
    for (const [cat, cmds] of cats.entries()) {
      txt += `╭─❖ *${cat}*  ›  ${cmds.length}\n`;
      txt += cmds.map((c) => `│ ▸ ${config.PREFIX}${c}`).join('\n');
      txt += `\n╰━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    txt += `📢 ${config.PREFIX}channel  •  👥 ${config.PREFIX}group  •  ✨ _${config.BOT_NAME}_`;
    return txt;
  });
}

/* -------------------------------- handler -------------------------------- */
const handler = async (ctx) => {
  const { command, reply } = ctx;
  switch (command) {
    case 'menu':
    case 'help': {
      const q = ctx.arg ? ctx.arg.trim() : '';
      if (!q) {
        // Arm the NUMBERED reply: the user can just send 1, 2, 3… to open a
        // category (works for every number in the list).
        menuReply.arm(ctx.senderNum, ctx.session?.number, [...categories().keys()]);
        return sendMenu(ctx, categoriesText());
      }
      // FIX: a NUMBER after `.menu` (e.g. `.menu 1`) opens THAT numbered
      // category — exactly like replying "1" to the category list. Previously
      // it fell through to findCategory("1"), which always returned null and
      // answered "Category nahi mili". The number maps to the SAME order shown
      // in categoriesText() (1-based), and the sub-menu carries the bot DP.
      const numMatch = q.match(/^\d{1,3}$/);
      if (numMatch) {
        const cats = [...categories().keys()];
        const n = parseInt(numMatch[0], 10);
        if (n >= 1 && n <= cats.length) {
          const cat = cats[n - 1];
          return sendMenu(ctx, categoryText(cat), { caption: `📂 *${cat}*` });
        }
        return reply(`❌ *1* se *${cats.length}* ke darmiyan number chuno.\n\n💡 ${config.PREFIX}menu likho — saari categories dekhne ke liye.`);
      }
      const cat = findCategory(q);
      if (!cat) {
        return reply(`❌ Category *"${q}"* nahi mili.\n\n💡 ${config.PREFIX}menu likho — saari categories dekhne ke liye.`);
      }
      return sendMenu(ctx, categoryText(cat), { caption: `📂 *${cat}*` });
    }
    case 'menuall': {
      // Every menu carries the DP too (long text -> DP first, then the list).
      await sendMenu(ctx, allText(), { caption: `\ud83d\udcc2 *${config.BOT_NAME}* \u2022 \ud83d\udcda All Commands` });
      break;
    }
    case 'ping': {
      const t0 = Date.now();
      await reply('🏓 Pong!');
      const latency = Date.now() - t0;
      await reply(`🏓 *Pong!*\n⚡ Speed: *${latency}ms*\n⏱️ Uptime: ${formatDuration(Date.now() - startAt)}`);
      break;
    }
    case 'alive':
      await reply(`✅ *${config.BOT_NAME}* ZINDA hy! 🔥\n⏱️ Uptime: ${formatDuration(Date.now() - startAt)}\n👑 Owner: ${config.OWNER_NAME}\n\nType ${config.PREFIX}menu for commands.`);
      break;
    case 'uptime':
      await reply(`⏱️ Bot *${formatDuration(Date.now() - startAt)}* se chal raha hy.`);
      break;
    case 'owner': {
      if (!config.OWNER_NUMBER) return reply('❌ Owner number set nahi hy.');
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${config.OWNER_NAME}\nTEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER}:+${config.OWNER_NUMBER}\nEND:VCARD`;
      await ctx.send(ctx.from, { contacts: { displayName: config.OWNER_NAME, contacts: [{ vcard }] } }, { quoted: ctx.m });
      await reply(
        `👑 *Owner:* ${config.OWNER_NAME}\n` +
        `📱 *Number:* +${config.OWNER_NUMBER}\n\n` +
        `📢 *Channel:* ${config.CHANNEL_LINK}\n` +
        `👥 *Group:* ${config.GROUP_LINK}`
      );
      break;
    }
    case 'id': {
      const who = ctx.quoted ? (ctx.quoted.key.participant || ctx.quoted.key.remoteJid) : ctx.sender;
      await reply(`🆔 *ID:* ${who}\n👤 *Number:* +${(who || '').split('@')[0].split(':')[0]}`);
      break;
    }
    case 'getpp': {
      const who = ctx.arg ? ctx.arg.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : (ctx.quoted?.key.participant || ctx.sender);
      try {
        const pp = await ctx.sock.profilePictureUrl(who, 'image');
        await ctx.send(ctx.from, { image: { url: pp }, caption: '🖼️ Profile Picture' }, { quoted: ctx.m });
      } catch { await reply('❌ DP nahi mili ya private hy.'); }
      break;
    }
    case 'githubstalk': {
      if (!ctx.arg) return reply(`❌ Username do. Example: ${config.PREFIX}githubstalk whiskeysockets`);
      try {
        const r = await getJSON(`https://api.github.com/users/${encodeURIComponent(ctx.arg)}`);
        if (r.message) return reply('❌ User nahi mila.');
        await reply(`👤 *${r.name || r.login}*\n🔹 Username: ${r.login}\n📝 Bio: ${r.bio || '-'}\n📦 Public repos: ${r.public_repos}\n👥 Followers: ${r.followers}\n➡️ Following: ${r.following}\n📍 Location: ${r.location || '-'}\n🔗 ${r.html_url}`);
      } catch { await reply('❌ GitHub API error.'); }
      break;
    }
    case 'define': {
      if (!ctx.arg) return reply(`❌ Word do. Example: ${config.PREFIX}define hello`);
      const word = ctx.arg.trim().split(/\s+/)[0];
      try {
        const r = await getJSON(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=1`);
        const defs = (r?.[0]?.defs || []).map((d) => d.replace(/^[a-z]\t/, ''));
        if (!defs.length) {
          const u = await getJSON(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(word)}`).catch(() => null);
          const ud = u?.list?.[0]?.definition;
          if (ud) return reply(`📖 *${word}* (slang)\n\n✳️ ${ud.replace(/[[\]]/g, '').slice(0, 700)}`);
          return reply('❌ Meaning nahi mila.');
        }
        await reply(`📖 *${word}*\n\n${defs.slice(0, 3).map((d, i) => `${i + 1}. ${d}`).join('\n\n')}`);
      } catch { await reply('❌ Meaning nahi mila.'); }
      break;
    }
    case 'yts':
      if (!ctx.arg) return reply(`❌ Search likho. Example: ${config.PREFIX}yts naye song`);
      await reply(`🔎 *YouTube Search:* ${ctx.arg}\n\n🔗 https://youtube.com/results?search_query=${encodeURIComponent(ctx.arg)}`);
      break;
    case 'praytime': {
      if (!ctx.arg) return reply(`❌ City likho. Example: ${config.PREFIX}praytime Layyah`);
      try {
        const r = await getJSON(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(ctx.arg)}&country=Pakistan&method=1`);
        if (r.code !== 200) return reply('❌ City nahi mili.');
        const t = r.data.timings;
        await reply(`🕌 *Prayer Times — ${ctx.arg}*\n\n🌅 Fajr: ${t.Fajr}\n☀️ Dhuhr: ${t.Dhuhr}\n🌤️ Asr: ${t.Asr}\n🌇 Maghrib: ${t.Maghrib}\n🌃 Isha: ${t.Isha}`);
      } catch { await reply('❌ Prayer API error.'); }
      break;
    }
    case 'runtime':
      await reply(`⏱️ *Runtime:* ${formatDuration(Date.now() - startAt)}\n🟢 Node ${process.version}\n💾 RAM: ${(process.memoryUsage().rss / 1048576).toFixed(1)} MB`);
      break;
    case 'channel':
    case 'ch':
      await reply(`📢 *${config.BOT_NAME} Channel*\n\n🔗 ${config.CHANNEL_LINK}\n\n_Join karo latest updates ke liye!_`);
      break;
    case 'group':
    case 'gc':
      await reply(`👥 *${config.BOT_NAME} Group*\n\n🔗 ${config.GROUP_LINK}\n\n_Join karo aur support lo!_`);
      break;
    case 'repo':
      await reply(`📦 *${config.BOT_NAME}* — WhatsApp Bot\n🔗 ${config.REPO_LINK}`);
      break;
    case 'clear': {
      const before = msgStore.size;
      msgStore.clear();
      aiCache.clear();
      await reply(`🧹 *Clear done!*\n\n🗑️ ${before} stored messages hata diye.\n🧠 AI cache bhi clear ho gaya.`);
      break;
    }
    // ---- .clearcommand : wipe MY OWN inbox (my chat with myself) ------------
    // She asked for exactly this: clear the messages in "yourself" — the user's
    // own self-chat — not the current group or DM. Works by deleting our own
    // outgoing messages from that chat, newest first, with a short gap so
    // WhatsApp accepts each revoke.
    case 'clearcommand':
    case 'clearinbox':
    case 'clearall': {
      const target = `${ctx.senderNum}@s.whatsapp.net`;   // "yourself" = own number
      const n = Number(ctx.arg) || 30;                     // how many to try
      await reply(`🧹 *Aap ka inbox (yourself) saaf kar raha hoon…*\n_${n} messages tak_`);
      let done = 0;
      try {
        // fetch the most recent messages in that chat, then delete our own ones
        const store = await ctx.sock.fetchMessageHistory?.(n, ctx.m.key, 0).catch(() => null);
        const msgs = (store?.messages || []).filter((x) => x?.key?.remoteJid === target && x.key.fromMe);
        for (const mk of msgs) {
          try {
            await ctx.sock.sendMessage(target, { delete: mk.key });
            done += 1;
            await new Promise((r) => setTimeout(r, 350));  // be gentle, avoid rate limits
          } catch { /* skip this one */ }
        }
      } catch { /* ignore */ }
      await reply(
        done
          ? `✅ *Inbox saaf!*\n\n🗑️ ${done} messages hata diye.`
          : `ℹ️ Kuch nahi hata saka.\n\n_Note: WhatsApp sirf apne bheje hue messages delete karne deta hy, aur history fetch har device par kaam nahi karta._`
      );
      break;
    }
    default:
      await reply('❓ Unknown main command');
  }
};

/**
 * Per-message hook: consume a NUMBERED reply to the category menu.
 * After `.menu`, the user can simply send 1 / 2 / 3… and THAT category opens
 * (with the DP) — no need to type the category name. Works for every number.
 */
async function onMessage(ctx) {
  if (ctx.command) return; // only bare (non-command) replies
  // Never treat a status / channel post as a menu reply.
  const jid = ctx.from || '';
  if (jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return;
  const pick = menuReply.consume(ctx.senderNum, ctx.session?.number, ctx.text);
  if (!pick) return;
  if (pick.invalid) {
    await ctx.reply(`❌ *1* se *${pick.max}* ke darmiyan number chuno.`).catch(() => {});
    return;
  }
  await sendMenu(ctx, categoryText(pick.cat), { caption: `📂 *${pick.cat}*` }).catch(() => {});
}

module.exports = {
  commands: ['menu', 'help', 'menuall', 'ping', 'alive', 'uptime', 'owner', 'id', 'getpp', 'githubstalk', 'define', 'yts', 'praytime', 'runtime', 'repo', 'channel', 'ch', 'group', 'gc', 'clear', 'clearcommand', 'clearinbox', 'clearall'],
  category: '🔎 MAIN',
  handler,
  onMessage,
  resetBotPic,
};
