/**
 * FILES — document & file utilities (PDF, zip, convert, upload, meta)
 * Heavy lifting uses ffmpeg / system tools where available; everything else
 * is pure JS so it works on any host.
 */
const config = require('../config');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { getJSON, getText, downloadMedia, pick } = require('../lib/helpers');

const P = () => config.PREFIX;
const tmp = (name) => path.join(os.tmpdir(), `${name}_${Date.now()}`);

/** Get the media/document attached to the current (or quoted) message. */
function attached(ctx) {
  const q = ctx.quoted || ctx.m;
  const m = q?.message || {};
  return m.documentMessage || m.imageMessage || m.videoMessage || m.audioMessage || null;
}

const handler = async (ctx) => {
  const { command, reply, arg } = ctx;

  switch (command) {
    /* ---------------- info / metadata ---------------- */
    case 'filetype': {
      const doc = attached(ctx);
      if (!doc) return reply(`❌ Kisi file par reply karke ${P()}filetype likho.`);
      const name = doc.fileName || 'file';
      const ext = (name.split('.').pop() || '').toLowerCase();
      const kind = /^(jpg|jpeg|png|webp|gif|bmp)$/.test(ext) ? '🖼️ Image'
        : /^(mp4|mkv|mov|avi|webm)$/.test(ext) ? '🎬 Video'
        : /^(mp3|wav|ogg|m4a|opus)$/.test(ext) ? '🎵 Audio'
        : /^(pdf)$/.test(ext) ? '📕 PDF'
        : /^(zip|rar|7z|tar|gz)$/.test(ext) ? '🗜️ Archive'
        : /^(doc|docx|odt)$/.test(ext) ? '📄 Document'
        : /^(xls|xlsx|csv)$/.test(ext) ? '📊 Spreadsheet'
        : /^(apk)$/.test(ext) ? '📱 Android app'
        : '❓ Unknown';
      return reply(`📁 *File info*\n\n📛 ${name}\n🏷️ Type: ${kind} (.${ext})\n📦 Size: ${(doc.fileLength ? Number(doc.fileLength) / 1024 : 0).toFixed(1)} KB\n🔐 MIME: ${doc.mimetype || '—'}`);
    }
    case 'pdfmeta': {
      const doc = attached(ctx);
      if (!doc || !(doc.fileName || '').toLowerCase().endsWith('.pdf')) return reply(`❌ PDF par reply karke ${P()}pdfmeta likho.`);
      const buf = await downloadMedia(doc, 'document');
      const head = buf.slice(0, 4096).toString('latin1');
      const ver = /%PDF-([\d.]+)/.exec(head)?.[1] || '—';
      const pages = (head.match(/\/Type\s*\/Page[^s]/g) || []).length;
      const producer = /\/Producer\s*\(([^)]{0,60})/.exec(head)?.[1] || '—';
      return reply(`📕 *PDF metadata*\n\n📛 ${doc.fileName || 'document.pdf'}\n📦 Size: ${(buf.length / 1024).toFixed(1)} KB\n🔢 PDF version: ${ver}\n📄 Pages (approx): ${pages || '—'}\n🏭 Producer: ${producer}`);
    }
    case 'mediainfo': {
      const doc = attached(ctx);
      if (!doc) return reply(`❌ Kisi media par reply karke ${P()}mediainfo likho.`);
      return reply(`🎞️ *Media info*\n\n📛 ${doc.fileName || 'media'}\n🎭 MIME: ${doc.mimetype || '—'}\n📦 Size: ${(Number(doc.fileLength || 0) / 1024).toFixed(1)} KB\n${doc.width ? `📐 ${doc.width}×${doc.height}\n` : ''}${doc.seconds ? `⏱️ ${doc.seconds}s\n` : ''}${doc.pageCount ? `📄 ${doc.pageCount} pages\n` : ''}🔐 SHA-256: ${crypto.createHash('sha256').update(await downloadMedia(doc, 'document')).digest('hex').slice(0, 32)}…`);
    }
    case 'hashfile': {
      const doc = attached(ctx);
      if (!doc) return reply(`❌ File par reply karke ${P()}hashfile likho.`);
      const buf = await downloadMedia(doc, 'document');
      return reply(`🔐 *File hashes*\n\nMD5: \`${crypto.createHash('md5').update(buf).digest('hex')}\`\nSHA-1: \`${crypto.createHash('sha1').update(buf).digest('hex')}\`\nSHA-256: \`${crypto.createHash('sha256').update(buf).digest('hex')}\``);
    }

    /* ---------------- upload / share ---------------- */
    case 'filehost': case 'catbox': {
      const doc = attached(ctx);
      if (!doc) return reply(`❌ File par reply karke ${P()}filehost likho.`);
      try {
        const buf = await downloadMedia(doc, 'document');
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', new Blob([buf]), doc.fileName || 'file.bin');
        const r = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
        const url = (await r.text()).trim();
        if (!/^https?:/.test(url)) throw new Error('upload failed');
        return reply(`☁️ *File uploaded*\n\n📛 ${doc.fileName || 'file'}\n🔗 ${url}\n\n_Link permanent hai._`);
      } catch { return reply('❌ Upload nahi ho saka. File chhoti kar ke try karo (max ~200MB).'); }
    }
    case 'tempfile': {
      const doc = attached(ctx);
      if (doc) {
        try {
          const buf = await downloadMedia(doc, 'document');
          const r = await fetch('https://tmpfiles.org/api/v1/upload', {
            method: 'POST',
            body: (() => { const f = new FormData(); f.append('file', new Blob([buf]), doc.fileName || 'file.bin'); return f; })(),
          });
          const d = await r.json();
          const url = d?.data?.url?.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
          if (!url) throw new Error('no url');
          return reply(`⏳ *Temp file (24h)*\n\n📛 ${doc.fileName || 'file'}\n🔗 ${url}`);
        } catch { return reply('❌ Upload nahi ho saka.'); }
      }
      if (!arg) return reply(`❌ File par reply karo, ya text do: ${P()}tempfile <text>`);
      try {
        const f = new FormData();
        f.append('file', new Blob([arg]), 'note.txt');
        const r = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: f });
        const d = await r.json();
        return reply(`⏳ *Temp file*\n\n🔗 ${(d?.data?.url || '').replace('tmpfiles.org/', 'tmpfiles.org/dl/')}`);
      } catch { return reply('❌ Upload nahi ho saka.'); }
    }
    case 'textfile': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}textfile mera note`);
      try {
        const r = await fetch('https://dpaste.com/api/v2/', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ content: arg, expiry_days: '30' }),
        });
        const url = (await r.text()).trim();
        return reply(`📄 *Text file*\n\n🔗 ${url}\n\n_30 din tak rahega._`);
      } catch { return reply('❌ Upload nahi ho saka.'); }
    }
    case 'pastebin': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}pastebin mera code`);
      try {
        const r = await fetch('https://paste.rs/', { method: 'POST', body: arg });
        const url = (await r.text()).trim();
        return reply(`📋 *Paste*\n\n🔗 ${url}`);
      } catch { return reply('❌ Paste nahi ho saka.'); }
    }
    case 'gist': {
      if (!arg) return reply(`❌ Code/text do. Example: ${P()}gist console.log(1)`);
      if (!config.GITHUB_TOKEN) return reply(`❌ Gist banane ke liye GITHUB_TOKEN chahiye.\n\n_${P()}pastebin ${arg.slice(0, 20)} — ye bina token kaam karta hai._`);
      try {
        const r = await fetch('https://api.github.com/gists', {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'SAQIB MD' },
          body: JSON.stringify({ description: 'SAQIB MD paste', public: false, files: { 'snippet.txt': { content: arg } } }),
        });
        const d = await r.json();
        if (!d.html_url) throw new Error('fail');
        return reply(`🐙 *Gist created*\n\n🔗 ${d.html_url}`);
      } catch { return reply('❌ Gist nahi bana.'); }
    }

    /* ---------------- data conversion ---------------- */
    case 'csv2json': {
      if (!arg) return reply(`❌ CSV do. Example: ${P()}csv2json a,b\\n1,2`);
      const rows = arg.trim().split('\n').map((r) => r.split(','));
      const head = rows[0];
      const out = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()])));
      return reply(`🧩 *JSON*\n\n\`\`\`${JSON.stringify(out, null, 2).slice(0, 2500)}\`\`\``);
    }
    case 'json2csv': {
      if (!arg) return reply(`❌ JSON array do. Example: ${P()}json2csv [{"a":1,"b":2}]`);
      try {
        const arr = JSON.parse(arg);
        if (!Array.isArray(arr) || !arr.length) throw new Error('array do');
        const head = Object.keys(arr[0]);
        const csv = [head.join(','), ...arr.map((o) => head.map((h) => JSON.stringify(o[h] ?? '')).join(','))].join('\n');
        return reply(`📊 *CSV*\n\n\`\`\`${csv.slice(0, 2500)}\`\`\``);
      } catch (e) { return reply(`❌ Invalid JSON: ${e.message.slice(0, 80)}`); }
    }
    case 'xml2json': {
      if (!arg) return reply(`❌ XML do. Example: ${P()}xml2json <a>1</a>`);
      // dependency-free mini XML → JSON
      const toObj = (xml) => {
        const out = {};
        const re = /<(\w+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
        let m, any = false;
        while ((m = re.exec(xml))) {
          any = true;
          const val = /<\w+/.test(m[2]) ? toObj(m[2]) : m[2].trim();
          if (out[m[1]] !== undefined) out[m[1]] = [].concat(out[m[1]], val);
          else out[m[1]] = val;
        }
        return any ? out : xml.trim();
      };
      try {
        return reply(`🧩 *JSON*\n\n\`\`\`${JSON.stringify(toObj(arg), null, 2).slice(0, 2500)}\`\`\``);
      } catch { return reply('❌ XML parse nahi hua.'); }
    }

    /* ---------------- archives ---------------- */
    case 'zip': {
      const doc = attached(ctx);
      if (!doc) return reply(`❌ File par reply karke ${P()}zip likho (kuch bhi zip ho jayega).`);
      try {
        const buf = await downloadMedia(doc, 'document');
        // Build a real (single-entry, stored) zip — no dependencies.
        const name = (doc.fileName || 'file.bin');
        const crc = (() => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; })();
        const nameBuf = Buffer.from(name, 'utf8');
        const local = Buffer.alloc(30 + nameBuf.length);
        local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
        local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
        local.writeUInt32LE(crc, 14); local.writeUInt32LE(buf.length, 18); local.writeUInt32LE(buf.length, 22);
        local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28); nameBuf.copy(local, 30);
        const central = Buffer.alloc(46 + nameBuf.length);
        central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14);
        central.writeUInt32LE(crc, 16); central.writeUInt32LE(buf.length, 20); central.writeUInt32LE(buf.length, 24);
        central.writeUInt16LE(nameBuf.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(0, 42);
        nameBuf.copy(central, 46);
        const eocd = Buffer.alloc(22);
        eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
        eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length + buf.length, 16);
        const out = Buffer.concat([local, buf, central, eocd]);
        await ctx.send(ctx.from, { document: out, fileName: name.replace(/\.[^.]+$/, '') + '.zip', mimetype: 'application/zip' }, { quoted: ctx.m });
      } catch { return reply('❌ Zip nahi bana.'); }
    }
    case 'unzip': case '7z': {
      const doc = attached(ctx);
      if (!doc) return reply(`❌ Zip/archive par reply karke ${P()}unzip likho.`);
      const buf = await downloadMedia(doc, 'document');
      const names = [];
      let off = 0;
      while (off < buf.length - 30) {
        if (buf.readUInt32LE(off) !== 0x04034b50) break;
        const size = buf.readUInt32LE(off + 18);
        const nlen = buf.readUInt16LE(off + 26);
        const elen = buf.readUInt16LE(off + 28);
        names.push(buf.slice(off + 30, off + 30 + nlen).toString('utf8'));
        off += 30 + nlen + elen + size;
      }
      if (!names.length) return reply('❌ Ye zip nahi lagti (ya encrypted hai).');
      return reply(`🗜️ *Archive contents* (${names.length} files)\n\n${names.slice(0, 40).map((n) => '• ' + n).join('\n')}${names.length > 40 ? `\n_…aur ${names.length - 40}_` : ''}\n\n_Extract karne ke liye file PC par kholo._`);
    }

    /* ---------------- PDF (needs the file on a host with tools) ---------------- */
    case 'topdf': {
      const doc = attached(ctx);
      if (!doc) return reply(`❌ Image(s) par reply karke ${P()}topdf likho.\n\n_Multi-image → PDF ke liye images ek sath reply karo._`);
      try {
        const buf = await downloadMedia(doc, 'image');
        // Minimal single-image PDF wrapper (JPEG only, no re-encode).
        if (!/jpe?g/i.test(doc.mimetype || '')) {
          return reply('❌ Filhal sirf JPG images se PDF banti hai. (PNG → JPG ke liye .imgconvert jpg use karo)');
        }
        const w = doc.width || 1000, h = doc.height || 1000;
        const objs = [];
        objs.push('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj');
        objs.push('2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj');
        objs.push(`3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${w} ${h}]/Resources<</XObject<</Im0 4 0 R>>>>/Contents 5 0 R>>endobj`);
        const head = Buffer.from(`4 0 obj<</Type/XObject/Subtype/Image/Width ${w}/Height ${h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${buf.length}>>stream\n`, 'latin1');
        const tail = Buffer.from('\nendstream endobj', 'latin1');
        const stream = Buffer.from('5 0 obj<</Length 44>>stream\nq ' + w + ' 0 0 ' + h + ' 0 0 cm /Im0 Do Q\nendstream endobj', 'latin1');
        const head2 = Buffer.from('%PDF-1.4\n', 'latin1');
        const body = Buffer.concat([head2, Buffer.from(objs.join('\n') + '\n', 'latin1'), head, buf, tail, stream]);
        const xrefPos = body.length;
        const xref = Buffer.from(`xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n0000000225 00000 n \n0000000${String(body.length - stream.length + 30).padStart(3, '0')} 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`, 'latin1');
        const out = Buffer.concat([body, xref]);
        await ctx.send(ctx.from, { document: out, fileName: 'image.pdf', mimetype: 'application/pdf' }, { quoted: ctx.m });
      } catch { return reply('❌ PDF nahi ban saki. JPG image try karo.'); }
    }
    case 'mergepdf': case 'splitpdf': case 'compresspdf': case 'pdflock': case 'pdfunlock': case 'pdfpage':
    case 'pdftotext': case 'pdf2img': {
      const doc = attached(ctx);
      if (!doc) return reply(`❌ PDF par reply karke ${P()}${command} likho.`);
      if (command === 'pdftotext') {
        try {
          const buf = await downloadMedia(doc, 'document');
          const raw = buf.toString('latin1');
          const texts = [...raw.matchAll(/\((.*?)\)\s*Tj/g)].map((m) => m[1]).join(' ');
          const tj = [...raw.matchAll(/\[(.*?)\]\s*TJ/g)].map((m) => (m[1].match(/\((.*?)\)/g) || []).map((x) => x.slice(1, -1)).join('')).join(' ');
          const out = (texts + ' ' + tj).replace(/\\([()\\])/g, '$1').trim();
          if (!out) return reply('❌ Is PDF me text layer nahi mili (scanned PDF?).');
          return reply(`📄 *PDF text*\n\n${out.slice(0, 2500)}`);
        } catch { return reply('❌ Text extract nahi hua.'); }
      }
      return reply(`⚠️ *${command}* ko poora karne ke liye server par PDF tools (qpdf/ghostscript) chahiye.\n\n✅ Jo bina tools kaam karte hain: ${P()}pdfmeta, ${P()}pdftotext, ${P()}filetype, ${P()}hashfile\n\n_Chahte ho to main Railway image me tools add kar dun?_`);
    }

    /* ---------------- images (sharp-free, ffmpeg-free fallbacks) ---------------- */
    case 'imgcompress': case 'imgresize': case 'imgcrop': case 'imgconvert': case 'gifmaker': case 'mp4compress': case 'mp3tag': {
      const doc = attached(ctx);
      if (!doc) return reply(`❌ Media par reply karke ${P()}${command} likho.`);
      return reply(`⚠️ *${command}* ke liye image/video tools (sharp/ffmpeg) chahiye jo is host par nahi hain.\n\n✅ Jo kaam karte hain: ${P()}removebg, ${P()}enhance1-16, ${P()}blur, ${P()}sticker\n\n_Chaho to main Railway image me ffmpeg/sharp add kar dun — phir ye sab chal jayenge._`);
    }

    /* ---------------- text/doc generators ---------------- */
    case 'menucard': {
      if (!arg) return reply(`❌ Format: ${P()}menucard Pizza Palace | Margherita 800 | Fajita 1200`);
      const [name, ...items] = arg.split('|').map((s) => s.trim());
      return reply(`🍽️ *${name || 'MENU'}*\n${'─'.repeat(24)}\n\n${items.map((i) => `▫️ ${i}`).join('\n')}\n\n${'─'.repeat(24)}\n_${config.BOT_NAME} — order karein!_`);
    }
    case 'invoice': {
      if (!arg) return reply(`❌ Format: ${P()}invoice Client Name | Item 1 x2 @500 | Item 2 @300`);
      const parts = arg.split('|').map((s) => s.trim());
      const client = parts.shift() || 'Client';
      let total = 0;
      const lines = parts.map((p) => {
        const m = /(.+?)\s*(?:x(\d+))?\s*@\s*([\d.]+)/.exec(p);
        if (!m) return `▫️ ${p}`;
        const qty = parseInt(m[2] || '1', 10);
        const rate = parseFloat(m[3]);
        const amt = qty * rate;
        total += amt;
        return `▫️ ${m[1]} — ${qty} × ${rate} = ${amt.toLocaleString()}`;
      });
      return reply(`🧾 *INVOICE*\n${'─'.repeat(24)}\n👤 ${client}\n📅 ${new Date().toDateString()}\n${'─'.repeat(24)}\n${lines.join('\n')}\n${'─'.repeat(24)}\n💰 *Total: PKR ${total.toLocaleString()}*\n\n_${config.BOT_NAME}_`);
    }
    default:
      return reply('❓ Unknown file command');
  }
};

module.exports = {
  commands: [
    'filetype', 'pdfmeta', 'mediainfo', 'hashfile', 'filehost', 'catbox', 'tempfile', 'textfile', 'pastebin',
    'gist', 'csv2json', 'json2csv', 'xml2json', 'zip', 'unzip', 'topdf', 'mergepdf', 'splitpdf',
    'compresspdf', 'pdflock', 'pdfunlock', 'pdfpage', 'pdftotext', 'pdf2img', 'imgcompress', 'imgcrop',
    'imgconvert', 'gifmaker', 'mp4compress', 'mp3tag', 'menucard', 'invoice',
    // extras that belong in this family
    '7z', 'imgresize',
  ],
  category: '📄 FILES',
  handler,
};
