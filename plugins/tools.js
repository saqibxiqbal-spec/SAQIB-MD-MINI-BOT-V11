/**
 * TOOLS — premium utility commands (weather, translate, qr, wiki, calc, etc.)
 */
const config = require('../config');
const img = require('../lib/imagegen');
const { getJSON, getText, pick, targetOf } = require('../lib/helpers');
const crypto = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { timeout: 90000, maxBuffer: 1024 * 1024 * 50 }, (e, so, se) => (e ? rej(new Error((se || e.message).slice(0, 200))) : res())));

/** Safe arithmetic evaluator (no eval) */
function safeCalc(expr) {
  const clean = String(expr).replace(/[^0-9+\-*/%().^ ]/g, '');
  if (!clean.trim()) throw new Error('Sahi expression likho');
  // tokenize + shunting-yard
  const tokens = clean.match(/(\d+\.?\d*|[+\-*/%^()])/g) || [];
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
  const out = [], ops = [];
  for (const t of tokens) {
    if (/^\d/.test(t)) out.push(parseFloat(t));
    else if (t === '(') ops.push(t);
    else if (t === ')') { while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()); ops.pop(); }
    else { while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop()); ops.push(t); }
  }
  while (ops.length) out.push(ops.pop());
  const st = [];
  for (const t of out) {
    if (typeof t === 'number') st.push(t);
    else { const b = st.pop(), a = st.pop(); st.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : t === '/' ? a / b : t === '%' ? a % b : Math.pow(a, b)); }
  }
  const r = st.pop();
  if (!isFinite(r)) throw new Error('Result infinite');
  return r;
}

/* ---- RSS helpers (dependency-free news parser) ---- */
function decodeXml(s) {
  return String(s)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function parseRss(xml) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    let title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const source = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1];
    if (!title) continue;
    title = decodeXml(title);
    const src = source ? decodeXml(source) : '';
    // Google News appends " - Source" to titles; strip it for a clean look
    if (src && title.endsWith(' - ' + src)) title = title.slice(0, -(src.length + 3)).trim();
    out.push({ title, source: src });
  }
  return out;
}

const handler = async (ctx) => {
  const { command, reply, arg } = ctx;

  switch (command) {
    case 'weather': {
      if (!arg) return reply(`❌ City do. Example: ${config.PREFIX}weather Lahore`);
      try {
        const r = await getJSON(`https://wttr.in/${encodeURIComponent(arg)}?format=j1`);
        const c = r.current_condition[0];
        await reply(`🌤️ *Weather — ${arg}*\n\n🌡️ Temp: ${c.temp_C}°C (feels ${c.FeelsLikeC}°C)\n☁️ ${c.weatherDesc[0].value}\n💧 Humidity: ${c.humidity}%\n💨 Wind: ${c.windspeedKmph} km/h\n👁️ Visibility: ${c.visibility} km`);
      } catch { await reply('❌ City nahi mili.'); }
      break;
    }
    case 'translate': case 'tr': {
      const parts = arg.split('|').map((s) => s.trim());
      const [text, lang] = parts.length > 1 ? [parts[0], parts[1]] : [arg, 'ur'];
      if (!text) return reply(`❌ Format: ${config.PREFIX}translate Hello | ur`);
      try {
        const r = await getJSON(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${encodeURIComponent(lang)}`);
        await reply(`🌐 *Translation (${lang}):*\n\n${r.responseData?.translatedText || '❌ fail'}`);
      } catch { await reply('❌ Translation fail.'); }
      break;
    }
    case 'qr': {
      if (!arg) return reply(`❌ Text do. Example: ${config.PREFIX}qr https://example.com`);
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(arg)}`;
      await ctx.send(ctx.from, { image: { url }, caption: `📱 *QR Code*\n👑 ${config.BOT_NAME}` }, { quoted: ctx.m });
      break;
    }
    case 'shorturl': case 'short': {
      if (!arg || !/^https?:/.test(arg)) return reply('❌ Valid URL do.');
      try {
        const r = await getText(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(arg)}`);
        await reply(`🔗 *Short URL:*\n${r}`);
      } catch { await reply('❌ Shorten fail.'); }
      break;
    }
    case 'calc': {
      if (!arg) return reply(`❌ Expression do. Example: ${config.PREFIX}calc 5*8+2`);
      try { await reply(`🧮 *${arg}* = *${safeCalc(arg)}*`); }
      catch (e) { await reply('❌ ' + e.message); }
      break;
    }
    case 'wiki': {
      if (!arg) return reply(`❌ Topic do. Example: ${config.PREFIX}wiki Pakistan`);
      try {
        const r = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(arg)}`);
        if (r.type === 'disambiguation' || !r.extract) return reply('❌ Topic nahi mila.');
        await reply(`📚 *${r.title}*\n\n${r.extract.slice(0, 900)}`);
      } catch { await reply('❌ Wikipedia fail.'); }
      break;
    }
    case 'time': {
      const tz = arg || config.TIMEZONE;
      // Native Intl — no network needed, 100% reliable.
      try {
        const s = new Date().toLocaleString('en-PK', { timeZone: tz, dateStyle: 'full', timeStyle: 'medium' });
        await reply(`🕐 *Time — ${tz}*\n${s}`);
      } catch {
        await reply(`🕐 *${config.TIMEZONE}*\n${new Date().toLocaleString('en-PK', { timeZone: config.TIMEZONE })}`);
      }
      break;
    }
    case 'ip': {
      const target = arg || '';
      try {
        const r = await getJSON(`http://ip-api.com/json/${encodeURIComponent(target)}`);
        if (r.status !== 'success') return reply('❌ IP info nahi mili.');
        await reply(`🌐 *IP Info*\n\nIP: ${r.query}\n🌍 Country: ${r.country}\n🏙️ City: ${r.city}\n📡 ISP: ${r.isp}\n🕐 Timezone: ${r.timezone}`);
      } catch { await reply('❌ IP lookup fail.'); }
      break;
    }
    case 'base64': {
      const [mode, ...rest] = arg.split(' ');
      const text = rest.join(' ');
      if (!text) return reply(`❌ Format: ${config.PREFIX}base64 encode hello`);
      if (mode === 'encode') await reply(`🔐 ${Buffer.from(text).toString('base64')}`);
      else if (mode === 'decode') { try { await reply(`🔓 ${Buffer.from(text, 'base64').toString('utf8')}`); } catch { await reply('❌ Invalid base64.'); } }
      else await reply('❌ Mode: encode | decode');
      break;
    }
    case 'hash': {
      if (!arg) return reply(`❌ Text do. Example: ${config.PREFIX}hash hello`);
      await reply(`🔒 *Hashes*\n\nMD5: ${crypto.createHash('md5').update(arg).digest('hex')}\nSHA1: ${crypto.createHash('sha1').update(arg).digest('hex')}\nSHA256: ${crypto.createHash('sha256').update(arg).digest('hex').slice(0, 40)}...`);
      break;
    }
    case 'password': {
      const len = Math.min(64, Math.max(8, parseInt(arg) || 16));
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      let pw = '';
      for (let i = 0; i < len; i++) pw += chars[crypto.randomInt(chars.length)];
      await reply(`🔑 *Generated Password (${len}):*\n\n\`${pw}\``);
      break;
    }
    case 'currency': case 'exchange': case 'fx': {
      const [amount, from, to] = arg.split(' ');
      if (!from || !to) return reply(`❌ Format: ${config.PREFIX}currency 100 USD PKR`);
      try {
        const r = await getJSON(`https://open.er-api.com/v6/latest/${from.toUpperCase()}`);
        const rate = r?.rates?.[to.toUpperCase()];
        if (!rate) return reply('❌ Currency nahi mili — code check karo (e.g. USD, PKR, INR).');
        await reply(`💱 *${amount || 1} ${from.toUpperCase()} = ${((parseFloat(amount) || 1) * rate).toFixed(2)} ${to.toUpperCase()}*`);
      } catch { await reply('❌ Currency API fail.'); }
      break;
    }
    case 'news': {
      const cats = {
        world: 'world news', pakistan: 'pakistan', india: 'india', tech: 'technology',
        sports: 'sports', business: 'business', entertainment: 'entertainment',
        cricket: 'cricket', science: 'science', health: 'health',
      };
      const key = (arg || '').trim().toLowerCase();
      const q = cats[key] || (arg ? arg : 'world news');
      try {
        // Google News RSS (search) — no API key, works worldwide
        let items = [];
        try {
          const xml = await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-PK&gl=PK&ceid=PK:en`);
          items = parseRss(xml);
        } catch { /* fall through */ }
        // fallback: BBC World RSS
        if (!items.length) {
          try { items = parseRss(await getText('https://feeds.bbci.co.uk/news/world/rss.xml')); } catch { /* ignore */ }
        }
        // fallback: Dawn (Pakistan)
        if (!items.length) {
          try { items = parseRss(await getText('https://www.dawn.com/feeds/home')); } catch { /* ignore */ }
        }
        items = items.slice(0, 6);
        if (!items.length) return reply('❌ News API fail — thori dair baad try karo.');
        const body = items.map((n, i) => `${i + 1}. *${n.title}*${n.source ? `\n   _${n.source}_` : ''}`).join('\n\n');
        const when = new Date().toLocaleString('en-PK', { timeZone: config.TIMEZONE });
        await reply(`📰 *Top News${arg ? ` — ${arg}` : ''}*\n\n${body}\n\n_🕐 ${when}_`);
      } catch { await reply('❌ News fail.'); }
      break;
    }
    case 'joke2': {
      try {
        const r = await getJSON('https://official-joke-api.appspot.com/random_joke');
        await reply(`😂 ${r.setup}\n\n${r.punchline}`);
      } catch { await reply('❌ Joke fail.'); }
      break;
    }
    case 'quote2': {
      try {
        const r = await getJSON('https://zenquotes.io/api/random');
        const q = Array.isArray(r) ? r[0] : r;
        await reply(`💬 *${q.q}*\n— ${q.a}`);
      } catch { await reply('❌ Quote fail.'); }
      break;
    }
    case 'wthr': {
      if (!arg) return reply(`❌ City do. Example: ${config.PREFIX}wthr Lahore`);
      try {
        const r = await getJSON(`https://wttr.in/${encodeURIComponent(arg)}?format=j1`);
        const c = r.current_condition[0];
        await reply(`🌤️ *${arg}* — ${c.temp_C}°C, ${c.weatherDesc[0].value}`);
      } catch { await reply('❌ City nahi mili.'); }
      break;
    }
    case 'clock': {
      const s = new Date().toLocaleString('en-PK', { timeZone: config.TIMEZONE, dateStyle: 'full', timeStyle: 'medium' });
      await reply(`🕰️ *${config.TIMEZONE}*\n${s}`);
      break;
    }
    case 'moon': {
      const now = new Date();
      const lp = 2551443; // lunar period (seconds)
      const newMoon = new Date('2000-01-06T18:14:00Z').getTime() / 1000;
      const phase = ((now.getTime() / 1000 - newMoon) % lp) / lp;
      const idx = Math.floor(phase * 8 + 0.5) % 8;
      const names = ['New Moon 🌑', 'Waxing Crescent 🌒', 'First Quarter 🌓', 'Waxing Gibbous 🌔', 'Full Moon 🌕', 'Waning Gibbous 🌖', 'Last Quarter 🌗', 'Waning Crescent 🌘'];
      await reply(`🌙 *Moon Phase*\n\n${names[idx]}\n📅 ${now.toDateString()}`);
      break;
    }
    case 'type': {
      if (!arg) return reply(`❌ Text do. Example: ${config.PREFIX}type hello`);
      await reply(`⌨️ *Typing…*\n\n${arg.split('').join(' ')}`);
      break;
    }
    case 'spinner': {
      const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      await reply(`🔄 ${frames[Math.floor(Math.random() * frames.length)]} Loading…`);
      break;
    }
    case 'loading':
      await reply('⏳ Loading…\n[▓▓▓▓▓▓▓░░░] 70%');
      break;
    case 'cd':
      await reply('⏱️ Countdown\n\n3️⃣ … 2️⃣ … 1️⃣ … 🚀 GO!');
      break;
    case 'rocket':
      await reply(`🚀\n╭──────╮\n│ ${config.BOT_NAME.slice(0, 6)} │\n╰──────╯\n   🔥🔥🔥\n  🚀 LAUNCH!`);
      break;
    case 'chumi': {
      const t = targetOf(ctx);
      const tag = t ? `@${t.num}` : 'sab';
      await reply(`😘 *Chumi!* 💋\n${ctx.pushname} ne ${tag} ko chumi di!`, t ? { mentions: [t.jid] } : {});
      break;
    }
    case 'fing': {
      const n = Math.floor(Math.random() * 5) + 1;
      await reply(`✋ ${'☝️'.repeat(n)} *${n} fingers!*`);
      break;
    }
    case 'nikal': {
      const t = targetOf(ctx);
      await reply(`🚪 *NIKAL!* ${t ? `@${t.num} ` : ''}bahar jao! 😤`, t ? { mentions: [t.jid] } : {});
      break;
    }
    case 'nppm': {
      if (!arg) return reply(`❌ Package naam do. Example: ${config.PREFIX}nppm express`);
      try {
        const r = await getJSON(`https://registry.npmjs.org/${encodeURIComponent(arg.trim())}`);
        if (r.error) return reply('❌ Package nahi mila.');
        const latest = r['dist-tags']?.latest;
        await reply(`📦 *${r.name}* @ ${latest}\n\n📝 ${(r.description || '-').slice(0, 300)}\n🔗 ${r.homepage || '-'}`);
      } catch { await reply('❌ npm lookup fail.'); }
      break;
    }
    case 'attp': {
      if (!arg) return reply(`❌ Text do. Example: ${config.PREFIX}attp SAQIB`);
      try {
        const prompt = `${arg} glowing neon text, dark background, centered, high quality`;
        const buf = await img.generateImage(prompt, { width: 512, height: 512 });
        const stamp = Date.now();
        const inp = path.join(os.tmpdir(), `attp_${stamp}.png`);
        const out = path.join(os.tmpdir(), `attp_${stamp}.webp`);
        fs.writeFileSync(inp, buf);
        await run('ffmpeg', ['-y', '-i', inp, '-vf', 'scale=512:512', '-c:v', 'libwebp', '-quality', '80', out]);
        await ctx.sendSticker(fs.readFileSync(out), false);
        [inp, out].forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
      } catch { await reply('❌ ATTP banane me error aaya.'); }
      break;
    }
    default: await reply('❓ Unknown tool command');
  }
};

module.exports = {
  commands: [
    'weather', 'wthr', 'translate', 'tr', 'qr', 'shorturl', 'short', 'calc', 'wiki', 'time', 'clock',
    'ip', 'base64', 'hash', 'password', 'currency', 'exchange', 'fx', 'news', 'joke2', 'quote2',
    'moon', 'type', 'spinner', 'loading', 'cd', 'rocket', 'chumi', 'fing', 'nikal', 'nppm', 'attp',
  ],
  category: '🧰 TOOLS',
  handler,
};
