const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'plugins');
const list = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort()) {
  try { const p = require(path.join(dir, f)); if (p && Array.isArray(p.commands) && typeof p.handler === 'function') list.push(Object.assign({}, p, { __file: f })); } catch {}
}
require(path.join(dir, '_registry.js')).set(list);
const main = require(path.join(dir, 'main.js'));

function render(arg) {
  return new Promise((resolve) => {
    let out = '';
    const ret = main.handler({
      command: 'menu', arg, from: 'x@g.us', isGroup: true,
      sender: '923106762478@s.whatsapp.net', senderNum: '923106762478', pushname: 'T', m: { key: {} },
      reply: (t) => { out = String(t); },
      send: (jid, c) => { out = String(c.caption || c.text || ''); },
    });
    Promise.resolve(ret).then(() => resolve(out));
  });
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wa = (s) => esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/`([^`\n]+)`/g, '<code>$1</code>');

(async () => {
  const cats = await render('');
  const ai = await render('ai');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SAQIB MD — New Premium Menu</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#0b141a;color:#e9edef;padding:24px;display:flex;gap:24px;flex-wrap:wrap;justify-content:center}
.phone{width:390px;max-width:100%;background:#111b21;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6)}
.bar{background:#202c33;padding:12px 16px;font-weight:600;font-size:14px;display:flex;align-items:center;gap:10px}
.dot{width:9px;height:9px;border-radius:50%;background:#25d366}
.chat{padding:16px;background:url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%230b141a"/></svg>')}
.bubble{background:#005c4b;border-radius:10px 10px 2px 10px;padding:12px 14px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;font-family:'Segoe UI',Roboto,sans-serif;max-height:640px;overflow:auto}
.bubble b{color:#fff}code{background:rgba(0,0,0,.25);padding:1px 4px;border-radius:4px;font-size:12px}
h3{color:#8696a0;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px 4px}
</style></head><body>
<div><h3>📂 .menu — Categories</h3><div class="phone"><div class="bar"><span class="dot"></span> SAQIB MD • online</div><div class="chat"><div class="bubble">${wa(cats)}</div></div></div></div>
<div><h3>🤖 .menu ai — Category</h3><div class="phone"><div class="bar"><span class="dot"></span> SAQIB MD • online</div><div class="chat"><div class="bubble">${wa(ai)}</div></div></div></div>
</body></html>`;
  fs.writeFileSync(path.join(__dirname, '..', 'preview', 'new-menu.html'), html);
  console.log('wrote preview/new-menu.html');
})();
