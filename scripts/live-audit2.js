/**
 * Live audit part 2 — mirror fallback, APK multi-source, audio, smart video.
 */
const path = require('path');
const fs = require('fs');

async function t(name, fn) {
  const t0 = Date.now();
  try { const r = await fn(); console.log(`  ✅ ${name} (${Date.now()-t0}ms) ${r || ''}`); }
  catch (e) { console.log(`  ❌ ${name} (${Date.now()-t0}ms): ${e.message}`); }
}

(async () => {
  const ytdlp = require('../lib/ytdlp');

  console.log('\n=== PROBLEM 7b: smart video (mirror fallback) ===');
  await t('downloadVideoSmart', async () => {
    const r = await ytdlp.downloadVideoSmart('https://youtu.be/dQw4w9WgXcQ');
    const size = fs.statSync(r.file).size;
    return `-> ${path.basename(r.file)} ${(size/1048576).toFixed(2)}MB audio=${r.audio}`;
  });

  console.log('\n=== PROBLEM 7c: audio download ===');
  await t('downloadAudio', async () => {
    const f = await ytdlp.downloadAudio('https://youtu.be/dQw4w9WgXcQ');
    return `-> ${path.basename(f)} ${(fs.statSync(f).size/1048576).toFixed(2)}MB`;
  });

  console.log('\n=== PROBLEM 11: APK multi-source search ===');
  // searchApk is internal to downloader.js — exercise via the plugin handler
  const downloader = require('../plugins/downloader');
  await t('apk whatsapp', async () => {
    const sent = [];
    const ctx = {
      command: 'apk', arg: 'whatsapp', args: ['whatsapp'], from: '123@g.us', isGroup: true,
      sender: '923001234567@s.whatsapp.net', senderNum: '923001234567', pushname: 'T', text: '.apk whatsapp',
      m: { key: { remoteJid: '123@g.us', id: 'M', fromMe: false }, message: {} }, quoted: null,
      isOwner: true,
      reply: (x) => { sent.push(String(x)); return Promise.resolve(); },
      send: (j, c) => { sent.push('SEND:' + JSON.stringify(c).slice(0, 120)); return Promise.resolve(); },
      react: () => Promise.resolve(),
    };
    await downloader.handler(ctx);
    return '-> ' + sent.join(' | ').slice(0, 200);
  });

  console.log('\n=== PROBLEM 6b: image via .imagine handler ===');
  const ai = require('../plugins/ai');
  await t('imagine', async () => {
    const sent = [];
    const ctx = {
      command: 'imagine', arg: 'a red dragon flying over mountains', args: ['a','red','dragon'],
      from: '123@g.us', isGroup: true, sender: '923001234567@s.whatsapp.net', senderNum: '923001234567',
      pushname: 'T', text: '.imagine dragon',
      m: { key: { remoteJid: '123@g.us', id: 'M', fromMe: false }, message: {} }, quoted: null, isOwner: true,
      sock: { sendPresenceUpdate: () => Promise.resolve() },
      reply: (x) => { sent.push(String(x).slice(0,80)); return Promise.resolve(); },
      send: (j, c) => { sent.push('IMG:' + (c.image ? (c.image.length + ' bytes') : 'none')); return Promise.resolve(); },
      react: () => Promise.resolve(),
    };
    await ai.handler(ctx);
    return '-> ' + sent.join(' | ');
  });

  console.log('\n=== live audit 2 done ===');
})();
