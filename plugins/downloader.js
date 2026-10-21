/**
 * DOWNLOADER — powered by yt-dlp
 * YouTube, Instagram, Facebook, Twitter/X, TikTok, Pinterest, CapCut,
 * MediaFire, Google Drive, Git repos, npm, Quran (audio + video) (1000+ sites).
 * TikTok also has a fast direct-URL path via tikwm.
 * `.tts` -> TikTok video search (Pakistani videos; up to 5).
 * `.apk <app>` -> searches Aptoide and sends the APK (large files supported).
 *
 * Fixes (P3):
 *  - `.ytvideo` / `.song` / `.play` / … now offer an Audio ⇄ Video choice.
 *  - `.apk` no longer refuses files > 95 MB (raises the cap, falls back to link).
 *  - `.surah` offers audio OR video (video via yt-dlp recitation search).
 *  - `.tts` returns up to 5 Pakistani videos.
 *  - `.movie` uses a dedicated "full movie" search.
 */
const config = require('../config');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { getJSON, getText, sleep } = require('../lib/helpers');
const interactions = require('../lib/interactions');
const ytdlp = require('../lib/ytdlp');
const media = require('../lib/media');
const apikeys = require('../lib/apikeys');

const isUrl = (s) => /^https?:\/\//i.test(s || '');
const MAX_MEDIA_BYTES = 64 * 1024 * 1024;   // WhatsApp audio/video cap (~64 MB)
const MAX_DOC_BYTES = 2 * 1024 * 1024 * 1024; // WhatsApp document cap (~2 GB)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const tmp = (ext) => path.join(os.tmpdir(), `saqibdl_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { timeout: 120000, maxBuffer: 1024 * 1024 * 50 }, (e, so, se) => (e ? rej(new Error((se || e.message).slice(0, 200))) : res())));

/** Media duration in seconds (0 when unknown) — WhatsApp plays audio far more
 *  reliably when it knows the length. Uses ffmpeg (no ffprobe dependency). */
const probeDuration = async (file) => {
  try { const { duration } = await media.probe(file); return duration || 0; } catch { return 0; }
};

async function sendMedia(ctx, filePath, caption, asAudio) {
  const stat = fs.statSync(filePath);
  const buf = fs.readFileSync(filePath);
  try {
    if (asAudio) {
      const seconds = await probeDuration(filePath);
      await ctx.send(ctx.from, { audio: buf, mimetype: 'audio/mpeg', ptt: false, seconds }, { quoted: ctx.m });
      return;
    }
    // BIG FILES: WhatsApp's audio/video cap is ~64MB. She asked for NO limit —
    // anything too big for a video goes out as a DOCUMENT instead of failing.
    if (buf.length > MAX_MEDIA_BYTES) {
      await sendDoc(ctx, buf, `${(caption.split('\n')[0] || 'video').replace(/[^\w\s.-]/g, '').trim().slice(0, 60) || 'video'}.mp4`, 'video/mp4');
      await ctx.reply('📄 File 64MB se bari thi — *document* me bhej di.').catch(() => {});
      return;
    }
    await ctx.send(ctx.from, { video: buf, caption, mimetype: 'video/mp4' }, { quoted: ctx.m });
  } finally { try { fs.unlinkSync(filePath); } catch { /* ignore */ } }
}

async function sendDoc(ctx, buf, fileName, mimetype) {
  if (buf.length > MAX_DOC_BYTES) throw new Error('File 2GB se bara hy.');
  await ctx.send(ctx.from, { document: buf, mimetype: mimetype || 'application/octet-stream', fileName }, { quoted: ctx.m });
}

/** Download the first result (audio or video). */
async function ytSearchDownload(ctx, query, asAudio) {
  const input = String(query).trim();
  // Fast path: a DATABASE-DRIVEN YouTube API (owner-set key/endpoint) — live,
  // no restart. Set it with `.apikey` (3 Song / 4 Video) or `.setapikey`.
  // Audio uses the `song` service, video uses `video`; both fall back to the
  // generic `youtube` service for backwards compatibility.
  const ytSvc = asAudio ? 'song' : 'video';
  const ytSvcUse = apikeys.has(ytSvc) ? ytSvc : (apikeys.has('youtube') ? 'youtube' : null);
  if (ytSvcUse) {
    try {
      const target = isUrl(input) ? input : await ytdlp.resolveUrl(input).catch(() => '');
      if (isUrl(target)) {
        const viaApi = await apiResolve(ytSvcUse, target);
        if (viaApi?.video || viaApi?.music) {
          const title = viaApi.title || input;
          if (asAudio) {
            return ctx.send(ctx.from, { audio: { url: viaApi.music || viaApi.video }, mimetype: 'audio/mpeg' }, { quoted: ctx.m });
          }
          return ctx.send(ctx.from, { video: { url: viaApi.video }, caption: `🎬 *${title}*\n👑 ${config.BOT_NAME}` }, { quoted: ctx.m });
        }
      }
    } catch { /* fall through to yt-dlp */ }
  }
  if (!ytdlp.available()) return ctx.reply('❌ Downloader engine (yt-dlp) available nahi hy.');
  // Only fetch metadata when we already have a URL (avoids a slow blocked YT search).
  const meta = isUrl(input) ? await ytdlp.info(input).catch(() => ({ title: '' })) : { title: query };
  await ctx.reply(`⬇️ *${meta.title || query}*\n_${asAudio ? '🎵 Audio' : '🎬 Video'} download ho raha hy…_`);
  if (asAudio) {
    const song = await ytdlp.downloadSongSmart(input);
    const title = song.title || meta.title || query;
    const by = song.artists ? `\n🎤 ${song.artists}` : '';
    const src = song.source && song.source !== 'fallback' ? `\n📡 ${song.source}` : '';
    await sendMedia(ctx, song.file, `🎵 *${title}*${by}${src}\n👑 ${config.BOT_NAME}`, true);
    return;
  }
  // VIDEO: she asked for video, so never silently hand back an audio file.
  // If YouTube is blocked we try the alternate routes first; if only the audio
  // is available we say so explicitly and still deliver the song.
  const { file, audio, title: aTitle, artists: aArtists } = await ytdlp.downloadVideoSmart(input);
  if (audio) {
    const t = aTitle || meta.title || query;
    const by = aArtists ? `\n🎤 ${aArtists}` : '';
    await ctx.reply('⚠️ *Video* nahi mil saki (YouTube ne block kiya) — yeh *audio* bhej raha hoon.').catch(() => {});
    await sendMedia(ctx, file, `🎵 *${t}*${by}\n👑 ${config.BOT_NAME}`, true);
    return;
  }
  await sendMedia(ctx, file, `🎬 *${meta.title || query}*\n👑 ${config.BOT_NAME}`, false);
}

/**
 * Ask the user whether they want audio or video, then download the chosen one.
 * Uses the interactive-reply system (they answer 1 / 2).
 */
async function askDownload(ctx, query) {
  interactions.set(ctx.from, ctx.sender, 'choice', {
    options: [
      { run: (c) => ytSearchDownload(c, query, true).catch((e) => c.reply('❌ ' + (e.message || 'Audio download fail.'))) },
      { run: (c) => ytSearchDownload(c, query, false).catch((e) => c.reply('❌ ' + (e.message || 'Video download fail.'))) },
    ],
  });
  return ctx.reply(`🎬 *${query}*\n\n1️⃣ 🎵 Audio (MP3)\n2️⃣ 🎬 Video (MP4)\n\n_Reply *1* ya *2* karo!_`);
}

/* --------------------------- TikTok search helpers --------------------------- */
/** Extract candidate TikTok video URLs from a search-results HTML page. */
function extractTiktokUrls(html) {
  const out = new Set();
  let m;
  const reV = /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.\-]+\/video\/\d{15,}/g;
  while ((m = reV.exec(html))) out.add(m[0].replace(/&amp;/g, '&'));
  const reU = /uddg=([^&"')]+)/g;
  while ((m = reU.exec(html))) {
    try {
      const d = decodeURIComponent(m[1]);
      if (/tiktok\.com\/@[^/]+\/video\/\d{15,}/.test(d)) out.add(d.split('?')[0]);
    } catch { /* ignore */ }
  }
  const reS = /https?:\/\/(?:vt|vm)\.tiktok\.com\/[\w-]+/g;
  while ((m = reS.exec(html))) out.add(m[0]);
  return [...out].filter((u) => /\/video\/\d{15,}/.test(u) || /(?:vt|vm)\.tiktok\.com/.test(u));
}

/**
 * Search TikTok videos for a query. Tries several backends in order and
 * returns up to `limit` video URLs (first working backend wins).
 */
async function tiktokSearch(query, limit = 5) {
  const variants = [`${query} tiktok`, `tiktok ${query}`, `${query} site:tiktok.com`];
  const found = [];
  const collect = (html) => {
    for (const u of extractTiktokUrls(html)) { if (!found.includes(u)) found.push(u); if (found.length >= limit) break; }
  };

  // Backend 1: Bing Videos
  for (const v of variants) {
    if (found.length >= limit) break;
    try {
      const html = await getText(`https://www.bing.com/videos/search?q=${encodeURIComponent(v)}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': 'SRCHHPGUSR=SRCHLANG=en' } }, 20000);
      collect(html);
    } catch { /* next */ }
    await sleep(150);
  }

  // Backend 2: DuckDuckGo (direct then Jina reader proxy)
  for (const v of variants) {
    if (found.length >= limit) break;
    for (const url of [
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(v)}`,
      `https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(v)}`,
    ]) {
      if (found.length >= limit) break;
      try {
        const html = await getText(url, { headers: { 'User-Agent': UA, 'Accept': 'text/plain' } }, 20000);
        collect(html);
      } catch { /* next */ }
    }
  }
  return found.slice(0, limit);
}

/**
 * Resolve a media URL through a DATABASE-DRIVEN downloader API.
 * ---------------------------------------------------------------------------
 * The owner stores a key + optional endpoint in MongoDB with
 * `.setapikey <service> <key> [endpoint]`. When one is present we hit it FIRST
 * (before tikwm / yt-dlp) so the operator can plug in any paid/free provider
 * and change it LIVE — no redeploy. Returns `{ video, title, music }` or null.
 *
 * The endpoint is called as `<endpoint>?url=<encoded>&apikey=<key>&key=<key>`
 * (a `?` in the base is respected) AND the key is also sent in the `x-api-key`
 * header, so providers that use any of those slots (e.g. WhiteShadow) work
 * without code changes. We accept the common response shapes so a variety of
 * providers work too.
 */
async function apiResolve(service, url) {
  const rec = apikeys.getService(service);
  if (!rec || !rec.key || !rec.endpoint) return null;
  const sep = rec.endpoint.includes('?') ? '&' : '?';
  const k = encodeURIComponent(rec.key);
  // Providers name the key param differently and some (e.g. WhiteShadow
  // `whiteshadow-x-api.onrender.com`) ONLY read it from the `x-api-key`
  // header or a `key=` query param — never `apikey=`. So we send it every way
  // at once; any provider that doesn't use a given slot simply ignores it.
  const target = `${rec.endpoint}${sep}url=${encodeURIComponent(url)}&apikey=${k}&key=${k}`;
  try {
    const r = await getJSON(target, { headers: { 'x-api-key': rec.key, apikey: rec.key, 'user-agent': UA } }, 15000);
    const d = r?.data || r?.result || r || {};
    const video = d.play || d.video || d.url || d.download || d.hd || d.wmplay || d.nowm || d.video_url || d.videoUrl || d.mp4 || d.media;
    const music = d.music || d.audio || d.music_url || d.musicUrl || d.audio_url || d.audioUrl || d.mp3 || '';
    if (!video && !music) return null;
    return { video: video || music, title: d.title || r?.title || '', music };
  } catch { /* ignore — fall back to the keyless path */ }
  return null;
}

/** Resolve a TikTok URL to a playable mp4 (DB API first, then tikwm fast path). */
async function tiktokResolve(url) {
  const viaApi = await apiResolve('tiktok', url).catch(() => null);
  if (viaApi?.video) return viaApi;
  try {
    const r = await getJSON(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`, {}, 15000);
    if (r?.data?.play) return { video: r.data.play, title: r.data.title || '', music: r.data.music || '' };
  } catch { /* ignore */ }
  return null;
}

/** Send up to `limit` TikTok videos for a query (used by `.tts`). */
async function sendTiktokVideos(ctx, query, limit = 5) {
  if (!ytdlp.available()) return ctx.reply('❌ Downloader engine (yt-dlp) available nahi hy.');
  await ctx.reply(`🔎 *TikTok Search:* ${query}\n_${limit} videos dhoond raha hoon…_`);
  let urls = [];
  try { urls = await tiktokSearch(query, limit * 2); } catch { /* ignore */ }
  // Resolve to direct play URLs in parallel (fast, no 800ms drip).
  const resolved = (await Promise.all(urls.map(async (u) => {
    try { const f = await tiktokResolve(u); if (f?.video) return { url: f.video, title: f.title || '' }; } catch { /* ignore */ }
    return null;
  }))).filter(Boolean);
  // Relevance filter: drop results whose title shares NO word with the query.
  // This is what removes the "weird English videos" when searching e.g. a
  // Saraiki song — only on-topic clips survive.
  const words = String(query).toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  let picks = resolved.filter((v) => !words.length || words.some((w) => String(v.title).toLowerCase().includes(w)));
  if (!picks.length) picks = resolved;
  picks = picks.slice(0, limit);
  if (!picks.length) {
    try { await ytSearchDownload(ctx, query, false); }
    catch { await ctx.reply('❌ Kuch nahi mila — doosra keyword try karo.'); }
    return;
  }
  // ALBUM: send the album "container" first, then attach every clip to it.
  // WhatsApp shows all of them together in one grid/row instead of a long
  // vertical column of separate messages.
  try {
    const parent = await ctx.send(ctx.from, { album: { expectedImageCount: 0, expectedVideoCount: picks.length } }, { quoted: ctx.m });
    const parentKey = parent?.key;
    if (parentKey) {
      for (let i = 0; i < picks.length; i++) {
        const v = picks[i];
        await ctx.send(ctx.from, {
          video: { url: v.url },
          caption: `🎬 *TikTok* (${i + 1}/${picks.length})\n📝 ${(v.title || '').slice(0, 120)}\n👑 ${config.BOT_NAME}`,
          albumParentKey: parentKey,
        }, { quoted: ctx.m });
      }
      return;
    }
  } catch { /* fall through to individual sends */ }
  // Fallback: send them individually if the album API is unavailable.
  for (let i = 0; i < picks.length; i++) {
    const v = picks[i];
    try {
      await ctx.send(ctx.from, {
        video: { url: v.url },
        caption: `🎬 *TikTok* (${i + 1}/${picks.length})\n📝 ${(v.title || '').slice(0, 120)}\n👑 ${config.BOT_NAME}`,
      }, { quoted: ctx.m });
    } catch { /* ignore */ }
  }
}

/* ------------------------------- Quran surahs ------------------------------- */
const SURAH_NAMES = [
  'Al-Fatihah', 'Al-Baqarah', 'Aal-Imran', 'An-Nisa', 'Al-Maidah', 'Al-Anam', 'Al-Araf', 'Al-Anfal', 'At-Tawbah', 'Yunus',
  'Hud', 'Yusuf', 'Ar-Rad', 'Ibrahim', 'Al-Hijr', 'An-Nahl', 'Al-Isra', 'Al-Kahf', 'Maryam', 'Ta-Ha',
  'Al-Anbiya', 'Al-Hajj', 'Al-Muminun', 'An-Nur', 'Al-Furqan', 'Ash-Shuara', 'An-Naml', 'Al-Qasas', 'Al-Ankabut', 'Ar-Rum',
  'Luqman', 'As-Sajdah', 'Al-Ahzab', 'Saba', 'Fatir', 'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar', 'Ghafir',
  'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiyah', 'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf',
  'Adh-Dhariyat', 'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman', 'Al-Waqiah', 'Al-Hadid', 'Al-Mujadila', 'Al-Hashr', 'Al-Mumtahanah',
  'As-Saff', 'Al-Jumuah', 'Al-Munafiqun', 'At-Taghabun', 'At-Talaq', 'At-Tahrim', 'Al-Mulk', 'Al-Qalam', 'Al-Haqqah', 'Al-Maarij',
  'Nuh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyamah', 'Al-Insan', 'Al-Mursalat', 'An-Naba', 'An-Naziat', 'Abasa',
  'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin', 'Al-Inshiqaq', 'Al-Buruj', 'At-Tariq', 'Al-Ala', 'Al-Ghashiyah', 'Al-Fajr', 'Al-Balad',
  'Ash-Shams', 'Al-Layl', 'Ad-Duha', 'Ash-Sharh', 'At-Tin', 'Al-Alaq', 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', 'Al-Adiyat',
  'Al-Qariah', 'At-Takathur', 'Al-Asr', 'Al-Humazah', 'Al-Fil', 'Quraysh', 'Al-Maun', 'Al-Kawthar', 'Al-Kafirun', 'An-Nasr',
  'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas',
];

const handler = async (ctx) => {
  const { command, reply, arg } = ctx;

  // ---- YouTube: play / song / music / ytaudio / ytmp3 / ytmp4 / ytvideo ----
  // These now offer an Audio ⇄ Video choice before downloading.
  if (['play', 'song', 'music', 'ytaudio', 'ytmp3', 'ytmp4', 'ytvideo'].includes(command)) {
    if (!arg) return reply(`❌ Song/query do. Example: ${config.PREFIX}${command} Tum Hi Ho`);
    try { await askDownload(ctx, arg); }
    catch (e) { await reply('❌ ' + (e.message || 'Download fail.')); }
    return;
  }

  // ---- search-based video downloads: video / drama / cartoon ----
  if (['video', 'drama', 'cartoon'].includes(command)) {
    if (!arg) return reply(`❌ Naam do. Example: ${config.PREFIX}${command} funny cats`);
    try { await ytSearchDownload(ctx, arg, false); }
    catch (e) { await reply('❌ ' + (e.message || 'Download fail.')); }
    return;
  }

  // ---- movie: dedicated "full movie" search ----
  // She asked for two specific things here: the bot must SAY "movie aa rahi hy"
  // while it works, and the film must arrive as a DOCUMENT (not as a playable
  // video that WhatsApp compresses to mush). Both are handled below.
  if (command === 'movie') {
    if (!arg) return reply(`❌ Movie naam do. Example: ${config.PREFIX}movie Interstellar`);
    // Reply INSTANTLY so the bot never feels stuck, then work in the background.
    await reply(`🎬 *${arg}* — movie aa rahi hy…\n_best source dhoond raha hoon, thora intezar karein._`);
    try {
      // Search first and try the top few candidates (a plain "ytsearch1:" often
      // lands on a trailer, not the film). Stop at the first one that downloads.
      let candidates = [];
      try {
        const results = await ytdlp.search(`${arg} full movie`, 5).catch(() => []);
        candidates = results.map((r) => r.url).filter(Boolean);
      } catch { /* ignore */ }
      candidates.push(`${arg} full movie`, arg);
      let file = null;
      for (const c of candidates.slice(0, 4)) {
        file = await ytdlp.downloadVideo(c).catch(() => null);
        if (file) break;
      }
      if (!file) {
        // Mirror fallback before giving up (YouTube blocks datacenter IPs).
        const alt = await ytdlp.downloadVideoSmart(`${arg} full movie`).catch(() => null);
        if (alt && alt.file) { await sendMovieDoc(ctx, alt.file, arg, alt.audio); return; }
        return reply(`❌ *${arg}* nahi mili — naam check karo ya seedha link bhejo.`);
      }
      await sendMovieDoc(ctx, file, arg, false);
    } catch (e) {
      await reply('❌ ' + (e.message || 'Movie download fail.'));
    }
    return;
  }

  // ---- TikTok search: .tts / .ttsearch / .tiktoksearch (EXACT search, up to 5) ----
  if (['tts', 'ttsearch', 'tiktoksearch'].includes(command)) {
    if (!arg) return reply(`❌ Search keyword do. Example: ${config.PREFIX}tts saraiki song`);
    await sendTiktokVideos(ctx, arg, 5);
    return;
  }

  // ---- Quran surah: audio OR video ----
  if (command === 'surah') {
    const n = parseInt((arg || '').replace(/[^0-9]/g, ''), 10);
    if (!n || n < 1 || n > 114) return reply(`❌ Surah number do (1-114). Example: ${config.PREFIX}surah 1`);
    const name = SURAH_NAMES[n - 1] || `Surah ${n}`;
    interactions.set(ctx.from, ctx.sender, 'choice', {
      options: [
        { run: async (c) => {
          // Direct CDN — no yt-dlp, no YouTube bot-check, answers in ~1s.
          const pad = String(n).padStart(3, '0');
          const sources = [
            `https://cdn.mp3quran.net/audio/mishary-alafasy/r1/${pad}.mp3`,
            `https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/${n}.mp3`,
          ];
          for (const url of sources) {
            try {
              await c.send(c.from, { audio: { url }, mimetype: 'audio/mpeg', ptt: false }, { quoted: c.m });
              return;
            } catch { /* try the next source */ }
          }
          await c.reply('❌ Surah audio fail — dobara try karo.');
        } },
        { run: async (c) => {
          // Video used to go straight to a YouTube search, which is slow and is
          // exactly what YouTube's "sign in to confirm you're not a bot" check
          // blocks — that is why the video never arrived. Try the direct CDN
          // sources first and only fall back to YouTube.
          const pad = String(n).padStart(3, '0');
          const direct = [
            `https://cdn.mp3quran.net/video/mishary-alafasy/${pad}.mp4`,
            `https://cdn.islamic.network/quran/video-surah/ar.alafasy/${n}.mp4`,
          ];
          for (const url of direct) {
            try {
              await c.reply(`🎬 Surah ${name} video la raha hoon…`);
              const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
              if (!r.ok) continue;
              const len = Number(r.headers.get('content-length') || 0);
              if (len && len < 100 * 1024) continue; // too small to be a real video
              await c.send(c.from, { video: { url }, mimetype: 'video/mp4', caption: `📖 *Surah ${name}*\n👑 ${config.BOT_NAME}` }, { quoted: c.m });
              return;
            } catch { /* try the next source */ }
          }
          // Fallback: YouTube search (may be blocked — say so honestly).
          try { await ytSearchDownload(c, `Surah ${name} Quran recitation Alafasy`, false); }
          catch (e) { await c.reply('❌ ' + (e.message || 'Surah video fail.')); }
        } },
      ],
    });
    return reply(`📖 *Surah ${n} — ${name}*\n\n1️⃣ 🎵 Audio (MP3)\n2️⃣ 🎬 Video (MP4)\n\n_Reply *1* ya *2* karo!_`);
  }

  // ---- npm package info ----
  if (command === 'dlnpm') {
    if (!arg) return reply(`❌ Package naam do. Example: ${config.PREFIX}dlnpm express`);
    try {
      const r = await getJSON(`https://registry.npmjs.org/${encodeURIComponent(arg.trim())}`);
      if (r.error) return reply('❌ Package nahi mila.');
      const latest = r['dist-tags']?.latest;
      const v = r.versions?.[latest] || {};
      await reply(`📦 *${r.name}* @ ${latest}\n\n📝 ${(r.description || '-').slice(0, 300)}\n🔗 Homepage: ${r.homepage || '-'}\n👑 Author: ${(r.author && (r.author.name || r.author)) || '-'}\n📥 Tarball: ${v.dist?.tarball || '-'}\n\n_Install: npm i ${r.name}_`);
    } catch { await reply('❌ npm lookup fail.'); }
    return;
  }

  // ---- git repo -> zip ----
  if (command === 'gitclone') {
    const repo = (arg || '').replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return reply(`❌ Format: ${config.PREFIX}gitclone user/repo`);
    try {
      let res = await fetch(`https://codeload.github.com/${repo}/zip/refs/heads/main`);
      if (!res.ok) res = await fetch(`https://codeload.github.com/${repo}/zip/refs/heads/master`);
      if (!res.ok) return reply('❌ Repo nahi mila (public ho aur main/master branch ho).');
      const buf = Buffer.from(await res.arrayBuffer());
      await sendDoc(ctx, buf, `${repo.split('/')[1]}.zip`, 'application/zip');
    } catch (e) { await reply('❌ ' + (e.message || 'Clone fail.')); }
    return;
  }

  // ---- Google Drive direct download ----
  if (command === 'gdrive') {
    if (!isUrl(arg)) return reply(`❌ Drive link do. Example: ${config.PREFIX}gdrive https://drive.google.com/file/d/<id>/view`);
    const id = (arg.match(/[-\w]{25,}/) || [])[0];
    if (!id) return reply('❌ File ID nahi mila.');
    try {
      const res = await fetch(`https://drive.google.com/uc?export=download&id=${id}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await sendDoc(ctx, buf, `gdrive_${id}.bin`, 'application/octet-stream');
    } catch (e) { await reply('❌ ' + (e.message || 'Drive download fail.')); }
    return;
  }

  // ---- APK download: .apk <app name>  (or a direct URL) ----
  // Multi-source so one dead mirror never breaks the command. All free, no key.
  if (command === 'apk') {
    if (!arg) return reply(`❌ App naam do. Example: ${config.PREFIX}apk whatsapp`);
    if (isUrl(arg)) {
      await ctx.send(ctx.from, { document: { url: arg }, mimetype: 'application/vnd.android.package-archive', fileName: 'app.apk' }, { quoted: ctx.m });
      return;
    }
    const q = arg.trim();
    await reply(`🔎 *${q}* dhoond raha hoon…`);
    const app = await searchApk(q);
    if (!app) return reply(`❌ *${q}* nahi mila — naam check karo ya seedha link bhejo.`);
    const size = Number(app.size || 0);
    const mb = size ? (size / 1048576).toFixed(1) + ' MB' : 'unknown size';
    try {
      await ctx.send(ctx.from, {
        document: { url: app.url },
        mimetype: 'application/vnd.android.package-archive',
        fileName: `${String(app.name || q).replace(/[^\w.-]+/g, '_')}.apk`,
        caption: `📦 *${app.name}*\n🔢 Version: ${app.version || '—'}\n📏 ${mb}\n🏪 ${app.source}\n👑 ${config.BOT_NAME}`,
      }, { quoted: ctx.m });
    } catch {
      await reply(`📦 *${app.name}* ${app.version || ''}\n📏 ${mb}\n\n⚠️ Direct send fail — link se download karo:\n${app.url}`);
    }
    return;
  }

  // ---- TikTok -> sticker ----
  if (command === 'tsticker') {
    if (!isUrl(arg)) return reply(`❌ TikTok link do. Example: ${config.PREFIX}tsticker https://vt.tiktok.com/...`);
    if (!ytdlp.available()) return reply('❌ Downloader engine (yt-dlp) available nahi hy.');
    try {
      const file = await ytdlp.downloadVideo(arg);
      const out = tmp('webp');
      const ok = await media.runFfmpeg(['-y', '-i', file, '-t', '10', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2,fps=12', '-an', '-c:v', 'libwebp', '-quality', '80', out]);
      if (!ok) throw new Error('Sticker conversion fail.');
      await ctx.sendSticker(fs.readFileSync(out), true);
      [file, out].forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
    } catch (e) { await reply('❌ ' + (e.message || 'Sticker fail.')); }
    return;
  }

  if (!isUrl(arg)) return reply(`❌ Link do. Example: ${config.PREFIX}${command} <link>`);

  switch (command) {
    case 'tiktok': case 'tt': case 'ttmp3': case 'tiktok2': case 'tiktok3': {
      const asAudio = command === 'ttmp3';
      // Fast path 1: a DATABASE-DRIVEN API (owner-set key/endpoint) — live, no restart.
      try {
        const viaApi = await apiResolve('tiktok', arg);
        if (viaApi?.video) {
          if (asAudio && viaApi.music) return ctx.send(ctx.from, { audio: { url: viaApi.music }, mimetype: 'audio/mpeg' }, { quoted: ctx.m });
          return ctx.send(ctx.from, { video: { url: viaApi.video }, caption: `⬇️ *TikTok*\n🎬 ${viaApi.title || ''}\n👑 ${config.BOT_NAME}` }, { quoted: ctx.m });
        }
      } catch { /* fall through */ }
      // Fast path 2: tikwm (direct URL, no download)
      try {
        const r = await getJSON(`https://tikwm.com/api/?url=${encodeURIComponent(arg)}`);
        if (r?.data?.play) {
          if (asAudio) return ctx.send(ctx.from, { audio: { url: r.data.music }, mimetype: 'audio/mpeg' }, { quoted: ctx.m });
          return ctx.send(ctx.from, { video: { url: r.data.play }, caption: `⬇️ *TikTok*\n🎬 ${r.data.title || ''}\n👑 ${config.BOT_NAME}` }, { quoted: ctx.m });
        }
      } catch { /* fall through to yt-dlp */ }
      try {
        const file = asAudio ? await ytdlp.downloadAudio(arg) : await ytdlp.downloadVideo(arg);
        await sendMedia(ctx, file, `⬇️ *TikTok*\n👑 ${config.BOT_NAME}`, asAudio);
      } catch { await reply('❌ TikTok download fail.'); }
      break;
    }
    case 'instagram': case 'ig': case 'igdl': case 'igdl2': case 'igdl3': case 'reels':
    case 'facebook': case 'fb':
    case 'twitter': case 'x':
    case 'pinterest': case 'pin':
    case 'capcut': case 'mediafire': case 'megadl': case 'ytpost': case 'download': {
      const label = {
        instagram: 'Instagram', ig: 'Instagram', igdl: 'Instagram', igdl2: 'Instagram', igdl3: 'Instagram', reels: 'Reels',
        facebook: 'Facebook', fb: 'Facebook', twitter: 'Twitter/X', x: 'Twitter/X',
        pinterest: 'Pinterest', pin: 'Pinterest', capcut: 'CapCut', mediafire: 'MediaFire',
        megadl: 'Mega', ytpost: 'YouTube Post', download: 'Download',
      }[command] || 'Media';
      // Fast path: a DATABASE-DRIVEN API (owner-set key/endpoint), live, no restart.
      const svc = { instagram: 'instagram', ig: 'instagram', igdl: 'instagram', igdl2: 'instagram', igdl3: 'instagram', reels: 'instagram',
        facebook: 'facebook', fb: 'facebook', twitter: 'twitter', x: 'twitter' }[command];
      if (svc && apikeys.has(svc)) {
        try {
          const viaApi = await apiResolve(svc, arg);
          if (viaApi?.video) {
            return ctx.send(ctx.from, { video: { url: viaApi.video }, caption: `⬇️ *${label}*\n👑 ${config.BOT_NAME}` }, { quoted: ctx.m });
          }
        } catch { /* fall through to yt-dlp */ }
      }
      if (!ytdlp.available()) return reply('❌ Downloader engine (yt-dlp) available nahi hy.');
      try {
        const file = await ytdlp.downloadVideo(arg);
        await sendMedia(ctx, file, `⬇️ *${label}*\n👑 ${config.BOT_NAME}`, false);
      } catch { await reply('❌ Download fail — link public ho ya baad me try karo.'); }
      break;
    }
    case 'igmp3': {
      if (!ytdlp.available()) return reply('❌ Downloader engine (yt-dlp) available nahi hy.');
      try {
        const file = await ytdlp.downloadAudio(arg);
        await sendMedia(ctx, file, `🎵 *Instagram Audio*\n👑 ${config.BOT_NAME}`, true);
      } catch { await reply('❌ Audio download fail.'); }
      break;
    }
    default:
      await reply('❓ Unknown download command');
  }
};

/**
 * Search for an APK and return the BEST match — not just the first hit.
 * Aptoide is queried with a larger page, every candidate is scored against the
 * typed query (name + package similarity), and the closest one wins, so
 * `.apk whatsapp` always returns WhatsApp (com.whatsapp) and not a random
 * "WhatsApp Spy" / cleaner app. No API keys, no cost.
 */
const normApk = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function scoreApk(query, app) {
  const q = normApk(query);
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const name = String(app.name || '');
  const nl = name.toLowerCase();
  const n = normApk(name);
  const pkg = normApk(app.package || '');
  let score = 0;
  if (n === q) score += 1000;                       // exact name
  else if (n.startsWith(q)) score += 700;           // name starts with query
  else if (n.includes(q)) score += 450;             // name contains query
  else if (q.includes(n) && n.length >= 3) score += 250;
  if (pkg === 'com' + q || pkg === q) score += 900; // exact package (com.whatsapp)
  else if (pkg.startsWith('com' + q) || pkg.includes(q)) score += 220;
  score += words.filter((w) => nl.includes(w)).length * 70;
  // Prefer the canonical app over clones when scores are close: shorter,
  // cleaner names usually mean the original.
  score -= Math.max(0, name.length - q.length) * 0.5;
  return score;
}

async function searchApk(q) {
  const hosts = ['https://ws75.aptoide.com', 'https://ws2.aptoide.com'];
  const seen = new Map();
  for (const host of hosts) {
    try {
      const r = await getJSON(`${host}/api/7/apps/search?query=${encodeURIComponent(q)}&limit=25`, {}, 20000);
      for (const a of (r?.datalist?.list || [])) {
        if (!a?.file?.path) continue;
        const key = a.package || a.name;
        if (key && !seen.has(key)) seen.set(key, a);
      }
    } catch { /* next host */ }
    if (seen.size >= 20) break;
  }
  const list = [...seen.values()];
  if (!list.length) return null;
  // Keep only candidates that actually relate to the query.
  const qn = normApk(q);
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const relevant = list.filter((a) => {
    const n = normApk(a.name);
    const pkg = normApk(a.package || '');
    return n.includes(qn) || pkg.includes(qn) || words.some((w) => String(a.name || '').toLowerCase().includes(w));
  });
  const pool = relevant.length ? relevant : list;
  const best = pool.slice().sort((a, b) => scoreApk(q, b) - scoreApk(q, a))[0];
  return {
    name: best.name || q,
    version: best.file?.vername || best.file?.vercode || '',
    size: Number(best.size || best.file?.filesize || 0),
    url: best.file.path,
    source: 'Aptoide',
  };
}

/** Send a downloaded film as a DOCUMENT so WhatsApp doesn't re-encode it. */
async function sendMovieDoc(ctx, file, title, audio) {
  try {
    const size = fs.statSync(file).size;
    const mb = (size / 1048576).toFixed(1);
    await ctx.send(ctx.from, {
      document: fs.readFileSync(file),
      mimetype: audio ? 'audio/mpeg' : 'video/mp4',
      fileName: `${String(title).replace(/[^\w.-]+/g, '_')}.${audio ? 'mp3' : 'mp4'}`,
      caption: `🎬 *${title}*\n📏 ${mb} MB\n📄 Full movie (document)\n👑 ${config.BOT_NAME}`,
    }, { quoted: ctx.m });
  } catch (e) {
    await ctx.reply(`❌ File bhejne me masla: ${e.message || e}`);
  } finally {
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  }
}

module.exports = {
  commands: [
    'tiktok', 'tt', 'ttmp3', 'tiktok2', 'tiktok3', 'instagram', 'ig', 'igdl', 'igdl2', 'igdl3', 'reels',
    'facebook', 'fb', 'twitter', 'x', 'pinterest', 'pin', 'play', 'song', 'music', 'ytaudio', 'ytmp3',
    'ytmp4', 'ytvideo', 'apk', 'gdrive', 'capcut', 'mediafire', 'megadl', 'igmp3', 'ytpost', 'download',
    'tsticker', 'tts', 'ttsearch', 'tiktoksearch', 'surah', 'gitclone', 'video', 'drama', 'cartoon', 'movie', 'dlnpm',
  ],
  category: '📥 DOWNLOAD',
  handler,
  // exposed for tests only
  _apiResolve: apiResolve,
  _ytSearchDownload: ytSearchDownload,
};
