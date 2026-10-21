/**
 * MENU PREVIEW (ALTERNATIVE) — renders the *parallel-session* menu style
 * (commit dc43de4) into the same WhatsApp-style mockup, so the two designs can
 * be compared side by side. Output: preview/menu-preview-alt.html
 *
 * This is a preview-only script; it does NOT change the bot. The live bot uses
 * the compact design in plugins/main.js.
 */
const fs = require('fs');
const path = require('path');

// Load every plugin into the registry (same as the bot does).
const dir = path.join(__dirname, '..', 'plugins');
const list = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort()) {
  try { const p = require(path.join(dir, f)); if (p && Array.isArray(p.commands) && typeof p.handler === 'function') list.push(Object.assign({}, p, { __file: f })); } catch { /* skip */ }
}
require('../plugins/_registry.js').set(list);

const config = require('../config');
const fonts = require('../plugins/fonts');

function categories() {
  const map = new Map();
  for (const p of list) {
    const cat = p.category || 'OTHER';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(...p.commands);
  }
  return map;
}

// ---- the alternative (parallel-session) menu functions, verbatim ----
function header() {
  let name = config.BOT_NAME;
  try { name = fonts.applyDefault(config.BOT_NAME); } catch { /* keep plain */ }
  const when = new Date().toLocaleString('en-PK', { timeZone: config.TIMEZONE, hour12: true });
  return (
    `╭───❴ ✨ *${name}* ✨ ❵───╮\n` +
    `┃ ⚡ *Version*  : v${config.BOT_VERSION}\n` +
    `┃ 👑 *Owner*    : ${config.OWNER_NAME}\n` +
    `┃ 🕒 *Time*     : ${when}\n` +
    `┃ 💠 *Prefix*   : ${config.PREFIX}\n` +
    `╰────────────────────────╯`
  );
}

function categoriesText() {
  const cats = categories();
  const total = [...cats.values()].reduce((n, c) => n + c.length, 0);
  let txt = `${header()}\n\n`;
  txt += `╭──❴ 📂 *CATEGORIES* ❵──╮\n`;
  let i = 1;
  for (const [cat, cmds] of cats.entries()) {
    txt += `┃ ${String(i).padStart(2, '0')} ▸ *${cat}*\n`;
    txt += `┃     ╰─ ${cmds.length} commands\n`;
    i++;
  }
  txt += `╰────────────────────────╯\n\n`;
  txt += `📊 *Total:* ${total} commands\n\n`;
  txt += `╭──❴ 💡 *HOW TO USE* ❵──╮\n`;
  txt += `┃ ▸ ${config.PREFIX}menu <category>\n`;
  txt += `┃     ╰─ category ki commands\n`;
  txt += `┃ ▸ ${config.PREFIX}menuall\n`;
  txt += `┃     ╰─ saari commands\n`;
  txt += `╰────────────────────────╯\n\n`;
  txt += `_✨ ${config.BOT_NAME} — by ${config.OWNER_NAME}_`;
  return txt;
}

function categoryText(cat) {
  const cmds = categories().get(cat) || [];
  let txt = `${header()}\n\n`;
  txt += `╭──❴ ${cat} ❵──╮\n`;
  txt += `┃ 📦 ${cmds.length} commands\n`;
  txt += `╰────────────────────────╯\n\n`;
  const p = config.PREFIX;
  const rows = [];
  for (let i = 0; i < cmds.length; i += 2) {
    const a = `▸ ${p}${cmds[i]}`;
    const b = cmds[i + 1] ? `▸ ${p}${cmds[i + 1]}` : '';
    rows.push(b ? `${a.padEnd(26)}${b}` : a);
  }
  txt += rows.join('\n');
  txt += `\n\n╭──❴ 💡 ❵──╮\n`;
  txt += `┃ ${p}menu — categories\n`;
  txt += `┃ ${p}menuall — all commands\n`;
  txt += `╰────────────────────────╯`;
  return txt;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wa = (s) => esc(s)
  .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
  .replace(/_([^_\n]+)_/g, '<i>$1</i>');

const cats = categoriesText();
const countries = categoryText('🌍 COUNTRIES');

const botPic = fs.existsSync(path.join(__dirname, '..', 'assets', 'bot.jpg'))
  ? '../assets/bot.jpg' : '';

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SAQIB MD — Menu Preview (Alternative)</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, 'Noto Color Emoji', sans-serif;
    background: radial-gradient(1200px 600px at 20% 0%, #3b2312 0%, #1a110a 45%, #0d0806 100%);
    min-height: 100vh; display: flex; align-items: flex-start; justify-content: center;
    gap: 42px; padding: 48px 24px; flex-wrap: wrap;
  }
  .phone {
    width: 430px; background: #0b141a; border-radius: 38px; overflow: hidden;
    box-shadow: 0 40px 90px rgba(0,0,0,.65), 0 0 0 10px #11181d, 0 0 0 12px #2a3138;
  }
  .bar { background: #1f2c34; padding: 14px 18px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #2a3942; }
  .bar .avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background:#37474f; }
  .bar .meta { line-height: 1.25; }
  .bar .meta .name { color: #e9edef; font-weight: 600; font-size: 16px; }
  .bar .meta .sub { color: #8696a0; font-size: 12px; }
  .chat { background: #0b141a; background-image: radial-gradient(rgba(255,255,255,.03) 1px, transparent 1px); background-size: 22px 22px; padding: 22px 14px 30px; min-height: 640px; }
  .bubble { background: #202c33; border-radius: 14px; border-top-left-radius: 4px; padding: 10px; max-width: 100%; color: #e9edef; box-shadow: 0 1px 1px rgba(0,0,0,.4); margin-bottom: 16px; }
  .bubble .text { font-size: 14.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; padding: 4px 6px 2px; font-family: 'Segoe UI', Roboto, 'Noto Color Emoji', sans-serif; }
  .bubble .time { text-align: right; color: #8696a0; font-size: 11px; padding: 2px 6px 0; }
  .bubble .time .tick { color: #53bdeb; }
  .label { color:#ffcf9e; font-weight:700; font-size:13px; letter-spacing:.4px; text-align:center; margin-bottom:10px; text-transform:uppercase; }
  .col { display:flex; flex-direction:column; align-items:center; }
  .note { color:#c9b79e; font-size:12px; text-align:center; margin-top:8px; max-width:430px; }
</style></head>
<body>
  <div class="col">
    <div class="label">✦ Alternative style — .menu ✦</div>
    <div class="phone">
      <div class="bar">
        ${botPic ? `<img class="avatar" src="${botPic}" alt="">` : '<div class="avatar"></div>'}
        <div class="meta"><div class="name">SAQIB MD</div><div class="sub">online • bot</div></div>
      </div>
      <div class="chat">
        <div class="bubble">
          <div class="text">${wa(cats)}</div>
          <div class="time">4:14 PM <span class="tick">✓✓</span></div>
        </div>
        <p class="note">too long for the image caption → always sent as plain text</p>
      </div>
    </div>
  </div>

  <div class="col">
    <div class="label">✦ Alternative style — .menu countries ✦</div>
    <div class="phone">
      <div class="bar">
        ${botPic ? `<img class="avatar" src="${botPic}" alt="">` : '<div class="avatar"></div>'}
        <div class="meta"><div class="name">SAQIB MD</div><div class="sub">online • bot</div></div>
      </div>
      <div class="chat">
        <div class="bubble">
          <div class="text">${wa(countries)}</div>
          <div class="time">4:14 PM <span class="tick">✓✓</span></div>
        </div>
      </div>
    </div>
  </div>
</body></html>`;

const outDir = path.join(__dirname, '..', 'preview');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'menu-preview-alt.html'), html);
console.log('wrote preview/menu-preview-alt.html  (cats ' + cats.length + ' chars, countries ' + countries.length + ' chars)');
