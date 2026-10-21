/**
 * UTILS-2 — misc utilities (email, IP, timers, calculators, encoders)
 */
const config = require('../config');
const crypto = require('crypto');
const os = require('os');
const { getJSON, getText, pick, randInt } = require('../lib/helpers');

const P = () => config.PREFIX;

/* ---- tiny in-memory stores (per-process, reset on redeploy) ---- */
const mailboxes = new Map();   // id -> { address, created }
const todos = new Map();       // user -> [ {t, done} ]
const stopwatches = new Map(); // user -> startedAt

const MORSE = {
  a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---',
  k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-',
  u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', '0': '-----', '1': '.----', '2': '..---',
  '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

const handler = async (ctx) => {
  const { command, reply, arg, senderNum } = ctx;
  const who = senderNum || 'anon';

  switch (command) {
    /* ---------------- email ---------------- */
    case 'tempmail': {
      if (arg && arg.toLowerCase() === 'check') {
        const mb = mailboxes.get(who);
        if (!mb) return reply(`❌ Pehle ${P()}tempmail likho — mailbox banao.`);
        try {
          const d = await getJSON(`https://api.mail.tm/messages?page=1`);
          return reply(`📬 *Mailbox: ${mb.address}*\n\n${(d['hydra:member'] || []).slice(0, 5).map((m) => `• *${m.from?.address}*\n  ${m.subject}`).join('\n') || '_Koi mail nahi._'}`);
        } catch { return reply('❌ Inbox check nahi ho saka.'); }
      }
      try {
        const domains = await getJSON('https://api.mail.tm/domains?page=1');
        const domain = domains['hydra:member']?.[0]?.domain;
        if (!domain) throw new Error('no domain');
        const addr = `saqib${randInt(1000, 99999)}@${domain}`;
        const pass = crypto.randomBytes(6).toString('hex');
        const r = await fetch('https://api.mail.tm/accounts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: addr, password: pass }),
        });
        if (!r.ok) throw new Error('create failed');
        mailboxes.set(who, { address: addr, pass, created: Date.now() });
        return reply(`📧 *Temporary email*\n\n📮 Address: *${addr}*\n🔑 Password: ${pass}\n\n_Inbox dekhne ke liye ${P()}tempmail check_\n_(Ye mailbox sirf is bot ke chalte waqt tak rehta hai.)_`);
      } catch { return reply('❌ Temp email service abhi busy hai. Thori der baad try karo.'); }
    }

    /* ---------------- network ---------------- */
    case 'myip': {
      let d;
      try { d = await getJSON('https://api.ipify.org?format=json'); }
      catch { return reply('❌ IP abhi nahi mila. Thori der baad try karo.'); }
      let extra = '';
      try {
        const e = await getJSON(`http://ip-api.com/json/${d.ip}`);
        extra = `\n🌍 ${e.country} — ${e.city}\n🏢 ${e.isp}`;
      } catch { /* ignore */ }
      return reply(`🌐 *Server IP*\n\n📌 ${d.ip}${extra}`);
    }
    case 'ipinfo': {
      if (!arg) return reply(`❌ IP do. Example: ${P()}ipinfo 8.8.8.8`);
      try {
        const d = await getJSON(`http://ip-api.com/json/${encodeURIComponent(arg)}`);
        if (d.status !== 'success') throw new Error('bad ip');
        return reply(`🌐 *${arg}*\n\n🌍 ${d.country} (${d.countryCode})\n🏙️ ${d.regionName}, ${d.city}\n🏢 ISP: ${d.isp}\n🏛️ Org: ${d.org}\n📡 AS: ${d.as}\n📍 ${d.lat}, ${d.lon}\n🕐 ${d.timezone}`);
      } catch { return reply('❌ IP valid nahi.'); }
    }
    case 'whois': {
      if (!arg) return reply(`❌ Domain do. Example: ${P()}whois google.com`);
      try {
        const d = await getJSON(`https://rdap.org/domain/${encodeURIComponent(arg.replace(/^https?:\/\//, '').split('/')[0])}`);
        const ev = (d.events || []).find((e) => e.eventAction === 'registration');
        return reply(`🌐 *WHOIS — ${d.ldhName || arg}*\n\n📅 Registered: ${ev ? new Date(ev.eventDate).toDateString() : '—'}\n🏢 Registrar: ${d.entities?.find((e) => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find((x) => x[0] === 'fn')?.[3] || '—'}\n📊 Status: ${(d.status || []).slice(0, 3).join(', ')}`);
      } catch { return reply('❌ Domain info nahi mili.'); }
    }
    case 'dns': {
      if (!arg) return reply(`❌ Domain do. Example: ${P()}dns google.com`);
      const d = await getJSON(`https://dns.google/resolve?name=${encodeURIComponent(arg)}&type=A`);
      const a = (d.Answer || []).filter((x) => x.type === 1).map((x) => x.data);
      const mx = await getJSON(`https://dns.google/resolve?name=${encodeURIComponent(arg)}&type=MX`);
      return reply(`🌐 *DNS — ${arg}*\n\n📌 A: ${a.join(', ') || '—'}\n📧 MX: ${(mx.Answer || []).map((x) => x.data).join(', ') || '—'}`);
    }
    case 'unshort': {
      if (!arg) return reply(`❌ Short link do. Example: ${P()}unshort bit.ly/abc`);
      try {
        const url = /^https?:\/\//.test(arg) ? arg : `https://${arg}`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        let final = url;
        try {
          const r = await fetch(url, { redirect: 'follow', method: 'HEAD', signal: ctrl.signal });
          final = r.url;
        } finally { clearTimeout(t); }
        return reply(`🔗 *Link expand*\n\nShort: ${arg}\nFinal: ${final}\n${final === url ? '\n_⚠️ Redirect nahi mila._' : ''}`);
      } catch { return reply('❌ Link khol nahi saka.'); }
    }
    case 'pinghost': {
      if (!arg) return reply(`❌ Host do. Example: ${P()}pinghost google.com`);
      const t0 = Date.now();
      try {
        const r = await fetch(`https://${arg.replace(/^https?:\/\//, '')}`, { method: 'HEAD' });
        return reply(`📡 *${arg}*\n\n✅ Reachable — ${Date.now() - t0}ms (HTTP ${r.status})`);
      } catch {
        return reply(`📡 *${arg}*\n\n❌ Reachable nahi (${Date.now() - t0}ms)`);
      }
    }

    /* ---------------- time / calc ---------------- */
    case 'stopwatch': {
      if (arg === 'stop' || arg === 'reset') {
        const t0 = stopwatches.get(who);
        stopwatches.delete(who);
        if (!t0) return reply('⏱️ Stopwatch chal hi nahi raha tha.');
        const ms = Date.now() - t0;
        return reply(`⏱️ *Stopped*\n\n⏳ ${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s ${ms % 1000}ms`);
      }
      if (arg === 'lap' && stopwatches.has(who)) {
        const ms = Date.now() - stopwatches.get(who);
        return reply(`⏱️ *Lap* — ${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`);
      }
      stopwatches.set(who, Date.now());
      return reply(`⏱️ *Stopwatch started*\n\nRokne ke liye: ${P()}stopwatch stop`);
    }
    case 'timer': {
      const m = /^(\d+)\s*([smh]?)$/.exec((arg || '').trim());
      if (!m) return reply(`❌ Format: ${P()}timer 5m`);
      const n = parseInt(m[1], 10);
      const unit = m[2] || 'm';
      const secs = unit === 's' ? n : unit === 'h' ? n * 3600 : n * 60;
      if (secs > 3600) return reply('❌ Max 1 ghanta.');
      setTimeout(() => {
        ctx.send(ctx.from, { text: `⏰ *Timer!* ${n}${unit} poora ho gaya.` }).catch(() => {});
      }, secs * 1000);
      return reply(`⏰ *Timer set* — ${n}${unit}\n_Is chat me alert aayega._`);
    }
    case 'hours': {
      const parts = (arg || '').split(/[\s,-]+/).map((x) => x.trim()).filter(Boolean);
      if (parts.length < 2) return reply(`❌ Format: ${P()}hours 09:00 17:30`);
      const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
      const diff = toMin(parts[1]) - toMin(parts[0]);
      const d = diff < 0 ? diff + 1440 : diff;
      return reply(`🕐 *Work hours*\n\n${parts[0]} → ${parts[1]}\n\n⏳ *${Math.floor(d / 60)}h ${d % 60}m*${diff < 0 ? '\n_(raat ka shift)_' : ''}`);
    }
    case 'uuid': {
      return reply(`🔑 *UUID v4*\n\n\`${crypto.randomUUID()}\``);
    }
    case 'randnum': {
      const m = /(-?\d+)\s*[-–to ]+\s*(-?\d+)/.exec(arg || '');
      if (!m) return reply(`❌ Format: ${P()}randnum 1-100`);
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      const lo = Math.min(a, b), hi = Math.max(a, b);
      return reply(`🎲 *Random* (${lo}–${hi})\n\n👉 *${randInt(lo, hi)}*`);
    }
    case 'randpick': {
      const items = (arg || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (items.length < 2) return reply(`❌ Format: ${P()}randpick chai, coffee, juice`);
      return reply(`🎯 *Pick* — ${pick(items)}`);
    }
    case 'shuffle': {
      const items = (arg || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (items.length < 2) return reply(`❌ Format: ${P()}shuffle a, b, c`);
      for (let i = items.length - 1; i > 0; i--) { const j = randInt(0, i); [items[i], items[j]] = [items[j], items[i]]; }
      return reply(`🔀 *Shuffled*\n\n${items.map((x, i) => `${i + 1}. ${x}`).join('\n')}`);
    }
    case 'roman': {
      const n = parseInt(arg, 10);
      if (!(n > 0 && n < 4000)) return reply(`❌ 1–3999 ka number do. Example: ${P()}roman 2026`);
      const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
      let x = n, out = '';
      for (const [v, s] of map) while (x >= v) { out += s; x -= v; }
      return reply(`🔢 *${n}* = *${out}*`);
    }
    case 'percent': {
      const m = /([\d.]+)\s*%?\s*(?:of|\s)\s*([\d.]+)/i.exec(arg || '');
      if (!m) return reply(`❌ Format: ${P()}percent 15 of 2000`);
      const r = (parseFloat(m[1]) / 100) * parseFloat(m[2]);
      return reply(`📊 *${m[1]}% of ${m[2]}* = *${r.toLocaleString(undefined, { maximumFractionDigits: 2 })}*`);
    }
    case 'loan': {
      const m = /([\d.]+)\s*[, ]\s*([\d.]+)\s*%?\s*[, ]\s*(\d+)\s*(y|m|year|month)?/i.exec(arg || '');
      if (!m) return reply(`❌ Format: ${P()}loan 500000 20 5y`);
      const principal = parseFloat(m[1]);
      const rate = parseFloat(m[2]) / 100 / 12;
      const n = m[4]?.startsWith('m') ? parseInt(m[3], 10) : parseInt(m[3], 10) * 12;
      const emi = rate === 0 ? principal / n : (principal * rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1);
      return reply(`🏦 *Loan / EMI*\n\n💰 Amount: PKR ${principal.toLocaleString()}\n📈 Rate: ${m[2]}% annual\n⏳ Tenure: ${n} months\n\n💵 *Monthly EMI: PKR ${Math.round(emi).toLocaleString()}*\n📊 Total: PKR ${Math.round(emi * n).toLocaleString()}\n📉 Interest: PKR ${Math.round(emi * n - principal).toLocaleString()}`);
    }
    case 'discount': {
      const m = /([\d.]+)\s*[, ]\s*([\d.]+)\s*%?/.exec(arg || '');
      if (!m) return reply(`❌ Format: ${P()}discount 2000 30%`);
      const price = parseFloat(m[1]), off = parseFloat(m[2]);
      const save = (price * off) / 100;
      return reply(`🏷️ *Discount*\n\nOriginal: PKR ${price.toLocaleString()}\nDiscount: ${off}%\n\n✅ *Final: PKR ${(price - save).toLocaleString()}*\n💰 Bachat: PKR ${save.toLocaleString()}`);
    }
    case 'split': {
      const m = /([\d.]+)\s*[, ]\s*(\d+)/.exec(arg || '');
      if (!m) return reply(`❌ Format: ${P()}split 4500 4`);
      const total = parseFloat(m[1]), n = parseInt(m[2], 10);
      return reply(`🧾 *Bill split*\n\nTotal: PKR ${total.toLocaleString()}\nPeople: ${n}\n\n👤 *Per person: PKR ${Math.ceil(total / n).toLocaleString()}*`);
    }
    case 'age': {
      const m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(arg || '');
      if (!m) return reply(`❌ Format: ${P()}age 2000-05-12`);
      const b = new Date(+m[1], +m[2] - 1, +m[3]);
      if (isNaN(b)) return reply('❌ Date sahi nahi.');
      const now = new Date();
      let y = now.getFullYear() - b.getFullYear();
      let mo = now.getMonth() - b.getMonth();
      if (now.getDate() < b.getDate()) mo--;
      if (mo < 0) { y--; mo += 12; }
      const days = Math.floor((now - b) / 86400000);
      const next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
      if (next < now) next.setFullYear(next.getFullYear() + 1);
      const toBday = Math.ceil((next - now) / 86400000);
      return reply(`🎂 *Age*\n\n📅 DOB: ${b.toDateString()}\n\n🎉 *${y} saal, ${mo} mahine*\n📆 ${days.toLocaleString()} din\n🎈 Agla birthday: *${toBday} din baad*`);
    }
    case 'bmi': {
      const m = /([\d.]+)\s*[, ]\s*([\d.]+)/.exec(arg || '');
      if (!m) return reply(`❌ Format: ${P()}bmi 70 1.75  (kg, meters)`);
      const w = parseFloat(m[1]), h = parseFloat(m[2]);
      const bmi = w / (h * h);
      const cat = bmi < 18.5 ? '🔵 Underweight' : bmi < 25 ? '🟢 Normal' : bmi < 30 ? '🟠 Overweight' : '🔴 Obese';
      return reply(`⚖️ *BMI*\n\nWeight: ${w} kg\nHeight: ${h} m\n\n📊 *BMI: ${bmi.toFixed(1)}* — ${cat}\n\n_Healthy range: 18.5–24.9_`);
    }
    case 'weekday': {
      const m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(arg || '');
      if (!m) return reply(`❌ Format: ${P()}weekday 1990-03-14`);
      const d = new Date(+m[1], +m[2] - 1, +m[3]);
      return reply(`📅 *${d.toDateString()}*\n\n👉 ${['Itwar', 'Somwar', 'Mangal', 'Budh', 'Jumeraat', 'Jummah', 'Hafta'][d.getDay()]} tha.`);
    }
    case 'datecalc': {
      const m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(arg || '');
      if (!m) return reply(`❌ Format: ${P()}datecalc 2026-01-01`);
      const d = new Date(+m[1], +m[2] - 1, +m[3]);
      const diff = Math.ceil((d - Date.now()) / 86400000);
      return reply(`📆 *${d.toDateString()}*\n\n${diff > 0 ? `⏳ *${diff} din baqi*` : diff === 0 ? '🎯 Aaj hi hai!' : `✅ ${Math.abs(diff)} din pehle`}`);
    }
    case 'timestamp': {
      const n = parseInt(arg, 10);
      if (!n) {
        const now = Math.floor(Date.now() / 1000);
        return reply(`🕐 *Now*\n\nUnix: \`${now}\`\nISO: ${new Date().toISOString()}\n\n_${P()}timestamp 1700000000 — convert_`);
      }
      const d = new Date(n < 1e12 ? n * 1000 : n);
      return reply(`🕐 *Timestamp ${n}*\n\n📅 ${d.toUTCString()}\n🇵🇰 ${d.toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`);
    }
    case 'moonphase': {
      // met.no gives the lunar phase as a 0-360 angle (farmsense is dead).
      const today = new Date().toISOString().slice(0, 10);
      let d;
      try { d = await getJSON(`https://api.met.no/weatherapi/sunrise/3.0/moon?lat=24.86&lon=67.01&date=${today}`); }
      catch { return reply('❌ Moon phase abhi nahi mili. Thori der baad try karo.'); }
      const ang = d.properties?.moonphase;
      const names = [
        [22.5, '🌑 New Moon (naya chaand)'],
        [67.5, '🌒 Waxing Crescent'],
        [112.5, '🌓 First Quarter'],
        [157.5, '🌔 Waxing Gibbous'],
        [202.5, '🌕 Full Moon (poora chaand)'],
        [247.5, '🌖 Waning Gibbous'],
        [292.5, '🌗 Last Quarter'],
        [337.5, '🌘 Waning Crescent'],
        [360, '🌑 New Moon (naya chaand)'],
      ];
      const phase = names.find(([lim]) => ang < lim)?.[1] || '—';
      const pct = Math.round((1 - Math.abs(180 - ang) / 180) * 100);
      return reply(`🌙 *Moon phase*

${phase}\n📐 Angle: ${Number(ang).toFixed(1)}°\n💡 Illumination: ~${pct}%\n\n_${today}_`);
    }

    /* ---------------- encoders ---------------- */
    case 'morse': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}morse hello`);
      const isMorse = /^[.\- /]+$/.test(arg.trim());
      if (isMorse) {
        const out = arg.trim().split(/\s+/).map((c) => c.split('/').map((x) => MORSE_REV[x] || '').join('') || (c === '/' ? ' ' : '')).join('');
        return reply(`📻 *Decoded*\n\n${out.replace(/\//g, ' ')}`);
      }
      const out = arg.toLowerCase().split('').map((c) => (c === ' ' ? '/' : MORSE[c] || '')).filter(Boolean).join(' ');
      return reply(`📻 *Morse*\n\n${out}`);
    }
    case 'binary': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}binary hi`);
      if (/^[01\s]+$/.test(arg.trim())) {
        const out = arg.trim().split(/\s+/).map((b) => String.fromCharCode(parseInt(b, 2))).join('');
        return reply(`🔢 *Decoded*\n\n${out}`);
      }
      const out = arg.split('').map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
      return reply(`🔢 *Binary*\n\n${out}`);
    }
    case 'hex': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}hex hi`);
      if (/^[0-9a-f\s]+$/i.test(arg.trim()) && arg.replace(/\s/g, '').length % 2 === 0) {
        const out = arg.trim().split(/\s+/).map((h) => Buffer.from(h, 'hex').toString('utf8')).join(' ');
        return reply(`🔡 *Decoded*\n\n${out}`);
      }
      return reply(`🔡 *Hex*\n\n${Buffer.from(arg).toString('hex').match(/.{1,2}/g).join(' ')}`);
    }
    case 'caesar': {
      const m = /^(\d+)\s+(.+)$/.exec(arg || '');
      if (!m) return reply(`❌ Format: ${P()}caesar 3 hello`);
      const shift = parseInt(m[1], 10) % 26;
      const out = m[2].replace(/[a-z]/gi, (c) => {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + shift + 26) % 26) + base);
      });
      return reply(`🔐 *Caesar cipher (+${shift})*\n\n${out}`);
    }
    case 'case': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}case hello world`);
      const t = arg.toLowerCase();
      return reply(`🔤 *Cases*\n\nUPPER: ${arg.toUpperCase()}\nlower: ${t}\nTitle: ${t.replace(/\b\w/g, (c) => c.toUpperCase())}\nSentence: ${t.charAt(0).toUpperCase() + t.slice(1)}`);
    }
    case 'reverse': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}reverse hello`);
      return reply(`🔄 *Reversed*\n\n${arg.split('').reverse().join('')}`);
    }
    case 'palindrome': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}palindrome madam`);
      const clean = arg.toLowerCase().replace(/[^a-z0-9]/g, '');
      const rev = clean.split('').reverse().join('');
      return reply(`🔁 *${arg}*\n\n${clean === rev ? '✅ Palindrome hai!' : `❌ Palindrome nahi.\nUlta: ${rev}`}`);
    }
    case 'lorem': {
      const n = Math.min(parseInt(arg, 10) || 1, 10);
      const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
      const out = Array.from({ length: n }, () => {
        const len = randInt(20, 40);
        return Array.from({ length: len }, () => pick(words)).join(' ') + '.';
      }).join('\n\n');
      return reply(`📄 *Lorem ${n} paragraph*\n\n${out}`);
    }
    case 'wordcount': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}wordcount hello world`);
      const words = arg.trim().split(/\s+/).filter(Boolean);
      return reply(`📊 *Text stats*\n\n📝 Words: *${words.length}*\n🔤 Characters: ${arg.length}\n🔤 (bina space): ${arg.replace(/\s/g, '').length}\n📏 Lines: ${arg.split('\n').length}\n⏱️ Reading: ~${Math.ceil(words.length / 200)} min`);
    }
    case 'unixperm': case 'chmod': {
      const m = /^(\d{3})$/.exec(arg || '');
      if (!m) return reply(`❌ Format: ${P()}chmod 755`);
      const map = { 7: 'rwx', 6: 'rw-', 5: 'r-x', 4: 'r--', 3: '-wx', 2: '-w-', 1: '--x', 0: '---' };
      const d = m[1].split('').map((n) => map[n]).join('');
      return reply(`🔐 *chmod ${m[1]}*\n\n\`${d}\`\n\n_owner | group | others_`);
    }
    case 'jsonfmt': {
      if (!arg) return reply(`❌ JSON do. Example: ${P()}jsonfmt {"a":1}`);
      try {
        const o = JSON.parse(arg);
        return reply(`🧩 *Formatted JSON*\n\n\`\`\`${JSON.stringify(o, null, 2).slice(0, 2500)}\`\`\``);
      } catch (e) { return reply(`❌ Invalid JSON: ${e.message.slice(0, 80)}`); }
    }
    case 'urlencode': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}urlencode hello world`);
      try { return reply(`🔗 *URL encoded*\n\n${encodeURIComponent(arg)}\n\n_Decoded: ${decodeURIComponent(arg)}_`); }
      catch { return reply(`🔗 *URL encoded*\n\n${encodeURIComponent(arg)}`); }
    }
    default:
      return reply('❓ Unknown utility command');
  }
};

module.exports = {
  commands: [
    'tempmail', 'myip', 'stopwatch', 'moonphase', 'hours', 'uuid', 'ipinfo', 'whois', 'dns', 'unshort',
    'pinghost', 'timer', 'randnum', 'randpick', 'shuffle', 'roman', 'percent', 'loan', 'discount', 'split',
    'age', 'bmi', 'weekday', 'datecalc', 'timestamp', 'morse', 'binary', 'hex', 'caesar', 'case', 
    'palindrome', 'lorem', 'wordcount', 'chmod', 'jsonfmt', 'urlencode',
    // extras that belong in this family
    'unixperm',
  ],
  category: '🔧 UTILITY',
  handler,
};
