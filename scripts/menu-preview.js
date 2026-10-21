/**
 * MENU PREVIEW — renders the live menu into a WhatsApp-style HTML mockup so the
 * new design can be seen exactly as a user would. Output: preview/menu-preview.html
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
const main = require('../plugins/main.js');

function render(arg) {
  let out = '';
  main.handler({
    command: 'menu', arg, from: 'x@g.us', isGroup: true,
    sender: '923106762478@s.whatsapp.net', senderNum: '923106762478', pushname: 'T', m: { key: {} },
    reply: (t) => { out = String(t); },
    send: (jid, c) => { out = String(c.caption || c.text || ''); },
  });
  return out;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// WhatsApp markdown -> HTML (bold/italic) for a faithful preview.
const wa = (s) => esc(s)
  .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
  .replace(/_([^_\n]+)_/g, '<i>$1</i>');

const cats = render('');
const countries = render('countries');

const botPic = fs.existsSync(path.join(__dirname, '..', 'assets', 'bot.jpg'))
  ? '../assets/bot.jpg' : '';

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SAQIB MD — Menu Preview</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, 'Noto Color Emoji', sans-serif;
    background: radial-gradient(1200px 600px at 20% 0%, #123b34 0%, #0a1a17 45%, #060d0b 100%);
    min-height: 100vh; display: flex; align-items: flex-start; justify-content: center;
    gap: 42px; padding: 48px 24px; flex-wrap: wrap;
  }
  .phone {
    width: 430px; background: #0b141a; border-radius: 38px; overflow: hidden;
    box-shadow: 0 40px 90px rgba(0,0,0,.65), 0 0 0 10px #11181d, 0 0 0 12px #2a3138;
  }
  .bar {
    background: #1f2c34; padding: 14px 18px; display: flex; align-items: center; gap: 12px;
    border-bottom: 1px solid #2a3942;
  }
  .bar .avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background:#37474f; }
  .bar .meta { line-height: 1.25; }
  .bar .meta .name { color: #e9edef; font-weight: 600; font-size: 16px; }
  .bar .meta .sub { color: #8696a0; font-size: 12px; }
  .chat {
    background: #0b141a;
    background-image: radial-gradient(rgba(255,255,255,.03) 1px, transparent 1px);
    background-size: 22px 22px;
    padding: 22px 14px 30px; min-height: 640px;
  }
  .bubble {
    background: #202c33; border-radius: 14px; border-top-left-radius: 4px;
    padding: 8px; max-width: 100%; position: relative; color: #e9edef;
    box-shadow: 0 1px 1px rgba(0,0,0,.4); margin-bottom: 16px;
  }
  .bubble .pic { width: 100%; border-radius: 10px; display: block; margin-bottom: 8px; }
  .bubble .text {
    font-size: 14.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
    padding: 4px 6px 2px; font-family: 'Segoe UI', Roboto, 'Noto Color Emoji', sans-serif;
  }
  .bubble .time { text-align: right; color: #8696a0; font-size: 11px; padding: 2px 6px 0; }
  .bubble .time .tick { color: #53bdeb; }
  .caption-note { color:#8696a0; font-size:12px; text-align:center; margin: 6px 0 0; }
  .label { color:#7ff0d0; font-weight:700; font-size:13px; letter-spacing:.4px; text-align:center; margin-bottom:10px; text-transform:uppercase; }
  .col { display:flex; flex-direction:column; align-items:center; }
</style></head>
<body>
  <div class="col">
    <div class="label">✦ .menu — Categories ✦</div>
    <div class="phone">
      <div class="bar">
        ${botPic ? `<img class="avatar" src="${botPic}" alt="">` : '<div class="avatar"></div>'}
        <div class="meta"><div class="name">SAQIB MD</div><div class="sub">online • bot</div></div>
      </div>
      <div class="chat">
        <div class="bubble">
          ${botPic ? `<img class="pic" src="${botPic}" alt="">` : ''}
          <div class="text">${wa(cats)}</div>
          <div class="time">4:14 PM <span class="tick">✓✓</span></div>
        </div>
        <p class="caption-note">sent with the bot picture (caption mode)</p>
      </div>
    </div>
  </div>

  <div class="col">
    <div class="label">✦ .menu countries — Commands ✦</div>
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
fs.writeFileSync(path.join(outDir, 'menu-preview.html'), html);
console.log('wrote preview/menu-preview.html  (cats ' + cats.length + ' chars, countries ' + countries.length + ' chars)');
