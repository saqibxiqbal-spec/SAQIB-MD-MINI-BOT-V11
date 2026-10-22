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
const interactions = require('../lib/interactions');
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

/**
 * PREMIUM HEADER — a rich, modern card that reads beautifully on a phone.
 * Shows the live command count, category count, owner, time, prefix and status
 * so the very first lines of every menu already feel "premium".
 */
function header() {
  let name = config.BOT_NAME;
  try { name = fonts.applyDefault(config.BOT_NAME); } catch { /* keep plain */ }
  const when = new Date().toLocaleTimeString('en-PK', { timeZone: config.TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true });
  const cats = categories();
  const total = [...cats.values()].reduce((n, c) => n + c.length, 0);
  return (
    `┏━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
    `┃   ✦  *${name}*  ✦\n` +
    `┃   ⚡ PREMIUM EDITION  •  v${config.BOT_VERSION}\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━┛\n` +
    ` 👑 *Owner:* ${config.OWNER_NAME}\n` +
    ` 🕒 *Time:* ${when}\n` +
    ` 💠 *Prefix:* ${config.PREFIX}   📦 *Commands:* ${total}\n` +
    ` 📂 *Categories:* ${cats.size}   🟢 *Status:* ONLINE`
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
/**
 * WhatsApp image-caption limit. When a menu is a few characters over, we must
 * NOT split the picture into a separate message (the owner wants the bot DP
 * attached to the TOTAL menu in ONE message). Instead we drop the trailing
 * footer lines (channel/group/credits) until the caption fits.
 */
const CAPTION_LIMIT = 1024;
function fitCaption(text, limit = CAPTION_LIMIT) {
  if (text.length <= limit) return text;
  const lines = text.split('\n');
  // Drop trailing lines (blank line, channel/group footer) until it fits.
  while (lines.length > 1 && lines.join('\n').length > limit) lines.pop();
  let out = lines.join('\n');
  if (out.length > limit) out = out.slice(0, limit - 1) + '…';
  return out;
}

async function sendMenu(ctx, text, opts = {}) {
  const buf = botPicBuffer();
  // 1) DP + full menu in ONE message when the caption fits.
  //    `opts.fit` forces the single-message form (used by the TOTAL `.menu`
  //    list): if the text is a little too long we trim the footer, never split.
  if (buf && (text.length <= CAPTION_LIMIT || opts.fit)) {
    const caption = text.length <= CAPTION_LIMIT ? text : fitCaption(text);
    try {
      await ctx.send(ctx.from, { image: buf, caption }, { quoted: ctx.m });
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
    const bar = '━'.repeat(23);
    let txt = `${header()}\n\n`;
    txt += `┏${bar}┓\n`;
    txt += `┃   📂  *COMMAND CATEGORIES*   (${total})\n`;
    txt += `┗${bar}┛\n\n`;
    let i = 1;
    for (const [cat, cmds] of cats.entries()) {
      const num = String(i).padStart(2, '0');
      txt += ` *${num}* ▸ ${cat}   \`${cmds.length}\`\n`;
      i++;
    }
    txt += `\n${bar}\n`;
    txt += `💡 *Reply with a number* (1-${cats.size}) to open that category\n`;
    txt += `▸ ${config.PREFIX}menu <cat> • ${config.PREFIX}menuall\n`;
    txt += `\n📢 ${config.PREFIX}channel  •  👥 ${config.PREFIX}group  •  ✨ _${config.BOT_NAME}_`;
    return txt;
  });
}

/**
 * COMPACT HEADER for sub-menus.
 * The big `header()` card costs ~300 chars, which would push every category
 * list over WhatsApp's 1024-char caption limit and force the bot picture into
 * a SEPARATE message. Sub-menus therefore use this one-liner instead, so the
 * DP always travels with the command list in ONE message.
 */
function compactHeader() {
  let name = config.BOT_NAME;
  try { name = fonts.applyDefault(config.BOT_NAME); } catch { /* keep plain */ }
  const cats = categories();
  const total = [...cats.values()].reduce((n, c) => n + c.length, 0);
  return `✦ *${name}* • ⚡ v${config.BOT_VERSION} • 📦 ${total} cmds`;
}

/**
 * Lay commands out in a grid so a 180-command category still fits a caption.
 * Column count adapts to the longest command name so lines never wrap.
 */
function cmdGrid(cmds, p) {
  const items = cmds.map((c) => `▸ ${p}${c}`);
  if (!items.length) return [];
  const maxLen = items.reduce((m, s) => Math.max(m, s.length), 0);
  let cols = 3;
  if (maxLen * 3 + 6 > 46) cols = 2;
  if (maxLen * 2 + 4 > 46) cols = 1;
  const colW = maxLen + 2;
  const rows = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols).map((s) => s.padEnd(colW)).join('').trimEnd());
  }
  return rows;
}

/**
 * Build every page of a category sub-menu.
 * Each page is guaranteed <= CAPTION_LIMIT so it ships as ONE image+caption.
 * Big categories are paginated (`.menu <cat> 2`) instead of being split into
 * a picture message followed by a text message.
 */
function categoryPages(cat) {
  return cached('cat|' + cat, () => {
    const cmds = categories().get(cat) || [];
    const p = config.PREFIX;
    const bar = '━'.repeat(21);
    const head = compactHeader();
    const rows = cmdGrid(cmds, p);

    const titleFor = (pg, tot) =>
      `┏${bar}┓\n┃ ${cat} • ${cmds.length} cmds • ${pg}/${tot}\n┗${bar}┛`;

    const footerFor = (pg, tot) => {
      let f = `\n${bar}\n`;
      if (tot > 1) {
        const nxt = pg < tot ? pg + 1 : 1;
        f += `💡 ${p}menu ${cat.toLowerCase()} ${nxt} — ${pg < tot ? 'next page' : 'back to start'}\n`;
      }
      f += `💡 ${p}menu — categories\n`;
      f += `📢 ${p}channel • 👥 ${p}group`;
      return f;
    };

    const render = (slice, pg, tot) =>
      `${head}\n\n${titleFor(pg, tot)}\n\n${slice.join('\n')}${footerFor(pg, tot)}`;

    // Pick the largest grid-rows-per-page that keeps EVERY page under the
    // caption limit. Deterministic: walk down from "all rows on one page"
    // until the fully-rendered page set fits. No guessing, no oscillation.
    const build = (perPage) => {
      const total = Math.max(1, Math.ceil(rows.length / perPage));
      const out = [];
      for (let pg = 1; pg <= total; pg++) {
        out.push(render(rows.slice((pg - 1) * perPage, pg * perPage), pg, total));
      }
      return out;
    };

    let perPage = Math.max(1, rows.length);
    let pages = build(perPage);
    while (perPage > 1 && pages.some((t) => t.length > CAPTION_LIMIT)) {
      perPage -= 1;
      pages = build(perPage);
    }
    return pages;
  });
}

/** Back-compat helper: first page of a category. */
function categoryText(cat) {
  return categoryPages(cat)[0];
}

function allText() {
  return cached('all', () => {
    const cats = categories();
    const bar = '━'.repeat(23);
    let txt = `${header()}\n\n`;
    for (const [cat, cmds] of cats.entries()) {
      txt += `┏${bar}┓\n`;
      txt += `┃ ${cat}   \`${cmds.length}\`\n`;
      txt += `┗${bar}┛\n`;
      txt += cmds.map((c) => ` ▸ ${config.PREFIX}${c}`).join('\n');
      txt += `\n\n`;
    }
    txt += `${bar}\n`;
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
        return sendMenu(ctx, categoriesText(), { fit: true });
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
      // `.menu <cat> <page>` — big categories are paginated so every page
      // still fits ONE image+caption (bot DP never arrives separately).
      const parts = q.split(/\s+/).filter(Boolean);
      const pageArg = parts.length > 1 && /^\d{1,3}$/.test(parts[parts.length - 1])
        ? parseInt(parts.pop(), 10) : 1;
      const cat = findCategory(parts.join(' '));
      if (!cat) {
        return reply(`❌ Category *"${q}"* nahi mili.\n\n💡 ${config.PREFIX}menu likho — saari categories dekhne ke liye.`);
      }
      const pages = categoryPages(cat);
      const pg = Math.min(Math.max(1, pageArg), pages.length);
      return sendMenu(ctx, pages[pg - 1], { caption: `📂 *${cat}* • ${pg}/${pages.length}` });
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
  // COLLISION GUARD — the `.song` / `.play` / `.wyr` prompts ask the user to
  // reply "1" or "2". Those prompts are stored in lib/interactions. If one is
  // pending, IT owns the number: a stale `.menu` category pick must NOT fire
  // (that was the bug where replying "2" to `.song` opened menu category #2).
  // We also clear the stale menu so it can never fire on a later number.
  if (interactions.get(ctx.from, ctx.sender)) {
    menuReply.clear(ctx.senderNum, ctx.session?.number);
    return;
  }
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
  // exposed for diagnostics/tests only (no behaviour change)
  _internal: { categories, categoryPages, categoryText, categoriesText, allText, compactHeader, cmdGrid, CAPTION_LIMIT },
};
