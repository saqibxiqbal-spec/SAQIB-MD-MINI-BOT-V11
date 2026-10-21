/**
 * SAQIB MD — yt-dlp wrapper
 * -------------------------
 * One engine for YouTube, Instagram, Facebook, Twitter/X, TikTok, Pinterest
 * and 1000+ other sites. Downloads to a temp dir and returns the file path.
 *
 * The binary is resolved in this order:
 *   1. PATH (the Docker image installs it with apt/curl)
 *   2. a local copy in the temp bin dir
 *   3. a one-time runtime download of the standalone `yt-dlp_linux` binary
 *      (this is what makes downloads work on a plain Node host with an ephemeral disk,
 *      where apt is not available and yt-dlp was simply MISSING before).
 *
 * ffmpeg (needed to merge streams + extract mp3) is resolved by lib/media.js and
 * handed to yt-dlp via --ffmpeg-location, so a static/npm ffmpeg works too.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config');
const media = require('./media');
const saavn = require('./saavn');

const TMP = path.join(process.env.TMP_DIR || os.tmpdir(), 'saqib-dl');
const BIN_DIR = media.BIN_DIR;
const YTDLP_URL = process.env.YTDLP_URL || 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

/* ------------------------------ cookies ------------------------------ */
/**
 * YouTube blocks datacenter IPs with "Sign in to confirm you're not a bot".
 * Passing a logged-in browser's cookies fixes it. The cookie text lives in
 * config.YT_COOKIES (a Netscape cookies.txt blob); we write it to a temp file
 * once and hand the path to yt-dlp via --cookies.
 */
const COOKIE_FILE = path.join(TMP, 'cookies.txt');

function ensureCookieFile() {
  const raw = config.YT_COOKIES;
  if (!raw || typeof raw !== 'string' || raw.length < 50) return null;
  try {
    fs.mkdirSync(TMP, { recursive: true });
    // A Netscape cookies.txt is one cookie per line. If the blob lost its
    // newlines it is USELESS to yt-dlp — it silently ignores the file and
    // YouTube answers "Sign in to confirm you're not a bot", which is exactly
    // the block she reported. Rebuild the lines from the tab-separated records.
    // Host dashboards often store pasted newlines as the
    // two literal characters "\\n". yt-dlp needs real line breaks.
    let text = raw.replace(/\\r?\\n/g, '\n').replace(/\r/g, '');
    if (!text.includes('\n')) {
      text = text
        .replace(/\s+(#\s*(?:Netscape|https?))/g, '\n$1')
        .replace(/([^\n])\s+(?=\.?[\w.-]+\.(?:youtube|google|googlevideo|vellum)[\w.]*\t)/g, '$1\n');
    }
    // Drop junk lines that are not real cookie records — a malformed line makes
    // yt-dlp abort the whole download.
    const lines = text.split('\n').filter((l) => {
      const t = l.trim();
      if (!t) return false;
      if (t.startsWith('#')) return true;
      const parts = t.split('\t');
      if (parts.length < 7) return false;
      return !/vellum/i.test(t);
    });
    const cookies = lines.filter((l) => l && !l.trim().startsWith('#'));
    if (cookies.length < 1) return null;   // nothing usable — fall back to no cookies
    fs.writeFileSync(COOKIE_FILE, lines.join('\n') + '\n');
    return COOKIE_FILE;
  } catch { return null; }
}

/** yt-dlp args that apply to every call (cookies + a sane user agent). */
function commonArgs() {
  const out = ['--no-warnings'];
  const cf = ensureCookieFile();
  if (cf) out.push('--cookies', cf);
  // Recent YouTube challenges use yt-dlp's JS challenge solver. Node is
  // already required by this bot, so use it when the installed yt-dlp build
  // supports it; older builds simply ignore the option only if they never see
  // it, therefore keep it out of the shared args and add it per YouTube call.
  return out;
}

/* ---------------------------- binary resolution ---------------------------- */
let YTDLP = null;
let checked = false;
function ytdlpPath() {
  if (!checked) { YTDLP = media.which('yt-dlp') || media.which('yt-dlp_linux'); checked = true; }
  return YTDLP;
}

/** Can we bootstrap yt-dlp on this platform (download the standalone binary)? */
function canBootstrap() {
  return process.platform === 'linux' || process.platform === 'darwin';
}

/**
 * Ensure the yt-dlp binary exists, downloading the standalone build on first use
 * when the host has no apt/curl-installed copy. Returns the path or null.
 */
let _ensuring = null;
async function ensureYtDlp() {
  const found = ytdlpPath();
  if (found) return found;
  if (_ensuring) return _ensuring;
  _ensuring = (async () => {
    try {
      fs.mkdirSync(BIN_DIR, { recursive: true });
      const local = path.join(BIN_DIR, 'yt-dlp');
      if (fs.existsSync(local)) { YTDLP = local; checked = true; return local; }
      const r = await fetch(YTDLP_URL, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
      if (!r.ok) throw new Error(`download ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 500000) throw new Error('binary too small');
      fs.writeFileSync(local, buf);
      fs.chmodSync(local, 0o755);
      YTDLP = local; checked = true;
      console.log('[YTDLP] bootstrapped yt-dlp ->', local);
      return local;
    } catch (e) {
      console.error('[YTDLP] bootstrap failed:', e?.message || e);
      return null;
    } finally { _ensuring = null; }
  })();
  return _ensuring;
}

/** True when the engine is usable (already present, or bootstrappable). */
function available() { return !!ytdlpPath() || canBootstrap(); }

async function run(args, timeoutMs = 180000) {
  const bin = await ensureYtDlp();
  if (!bin) throw new Error('yt-dlp not installed');
  // Make sure ffmpeg exists BEFORE yt-dlp runs (it needs it to merge video+audio
  // and to extract mp3). On a host without apt this downloads it once.
  await media.ensureFfmpeg().catch(() => null);
  const ffdir = media.ffmpegDir();
  // Point yt-dlp at whatever ffmpeg we resolved (system, npm-static or the
  // runtime download). Without this, a non-PATH ffmpeg is invisible to yt-dlp
  // and merging / mp3 extraction fails.
  const full = ffdir ? ['--ffmpeg-location', ffdir, ...args] : args;
  return new Promise((resolve, reject) => {
    execFile(bin, full, { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message || '').slice(0, 300)));
      resolve(String(stdout || ''));
    });
  });
}

function newBase() {
  fs.mkdirSync(TMP, { recursive: true });
  return path.join(TMP, `s${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
}

function findFile(base) {
  const dir = path.dirname(base);
  const name = path.basename(base);
  const f = fs.readdirSync(dir).find((x) => x.startsWith(name));
  if (!f) throw new Error('download failed');
  return path.join(dir, f);
}

/* ---------------------- WhatsApp-playable video ---------------------- */
// WhatsApp only plays MP4 (H.264 + AAC). yt-dlp happily hands back WebM
// (VP9/Opus) or HEVC files, which is exactly why a downloaded clip showed
// "something wrong with this file". We probe the codec and, when it is not
// already H.264-in-MP4, convert it with ffmpeg before sending.
async function toPlayableMp4(file) {
  try {
    if (!file || !fs.existsSync(file)) return file;
    // Big files are sent as documents (codec does not matter) and transcoding
    // them would take minutes — skip.
    const size = fs.statSync(file).size;
    if (size > 120 * 1024 * 1024) return file;
    const isMp4 = /\.mp4$/i.test(file);
    const { vcodec } = await media.probe(file);
    const alreadyGood = isMp4 && (!vcodec || vcodec.startsWith('h264') || vcodec.startsWith('avc'));
    if (alreadyGood) return file;
    const out = file.replace(/\.[^.]+$/, '') + '.mp4';
    // 1) fast remux (lossless) — works when the codec is already MP4-safe.
    if (await media.runFfmpeg(['-y', '-i', file, '-c', 'copy', '-movflags', '+faststart', out], 120000)) {
      try { fs.unlinkSync(file); } catch { /* ignore */ }
      return out;
    }
    // 2) full re-encode for VP9/Opus/HEVC — guarantees a playable H.264/AAC MP4.
    if (await media.runFfmpeg(['-y', '-i', file, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], 600000)) {
      try { fs.unlinkSync(file); } catch { /* ignore */ }
      return out;
    }
    return file;
  } catch { return file; }
}

const isUrl = (s) => /^https?:\/\//i.test(s || '');
/** Accept a URL, a raw yt-dlp search token (ytsearch1:/scsearch1:), or a plain query. */
const asInput = (q) => {
  const s = String(q || '').trim();
  if (isUrl(s) || /^(ytsearch|scsearch|ytsearchdate)\d*:/i.test(s)) return s;
  return `ytsearch1:${s}`;
};

/** Video metadata: title, duration (s), thumbnail. Accepts URL or search query. */
async function info(input) {
  const out = await run([...commonArgs(), '--js-runtimes', 'node', '--skip-download', '--no-playlist', '--print', '%(title)s\t%(duration)s\t%(thumbnail)s', asInput(input)], 60000);
  const [title, duration, thumbnail] = out.trim().split('\t');
  return { title: title || '', duration: Number(duration) || 0, thumbnail: thumbnail || '' };
}

/** Fast multi-result search (flat playlist) — returns [{title, url}]. */
async function search(input, n = 5) {
  const s = String(input).trim();
  // Honour an explicit yt-dlp search prefix (scsearch / ytsearch / …); otherwise
  // default to a YouTube search. Previously the prefix was ALWAYS overwritten
  // with `ytsearch`, so `scsearch1:<song>` (the SoundCloud fallback) silently
  // searched YouTube instead of SoundCloud.
  const token = isUrl(s) ? s : (/^(?:yt|sc|sp|bc|ytmusic)search\d*:/i.test(s) ? s : `ytsearch${n}:${s}`);
  const out = await run([...commonArgs(), '--js-runtimes', 'node', '--skip-download', '--no-warnings', '--flat-playlist', '--print', '%(title)s\t%(webpage_url)s', token], 60000);
  return out.trim().split('\n').filter(Boolean).map((line) => {
    const idx = line.indexOf('\t');
    return idx >= 0 ? { title: line.slice(0, idx), url: line.slice(idx + 1) } : { title: line, url: '' };
  }).filter((r) => r.url);
}

/** Download audio as MP3, return file path. Accepts URL or search query. */
async function downloadAudio(input) {
  const base = newBase();
  const attempts = [
    [],
    ['--extractor-args', 'youtube:player_client=android'],
    ['--extractor-args', 'youtube:player_client=ios'],
    ['--extractor-args', 'youtube:player_client=tv'],
    ['--extractor-args', 'youtube:player_client=web_safari'],
  ];
  let lastErr = null;
  for (const extra of attempts) {
    try {
      await run([...commonArgs(), '--js-runtimes', 'node', '--no-playlist', ...extra, '-x', '--audio-format', 'mp3', '--audio-quality', '5', '-o', `${base}.%(ext)s`, asInput(input)], 180000);
      return findFile(base);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('audio download failed');
}

/** Download video as MP4. Tries several player clients before giving up. */
async function downloadVideo(input) {
  const base = newBase();
  const src = asInput(input);
  // YouTube increasingly blocks datacenter IPs. Different player clients behave
  // differently, so we try a few before declaring failure. Cookies (when
  // present) are added by commonArgs().
  const attempts = [
    ['-f', 'bv*[ext=mp4][height<=480]+ba[ext=m4a]/b[ext=mp4][height<=480]/b[height<=480]/b'],
    ['-f', 'b[ext=mp4][height<=720]/b[height<=720]/b', '--extractor-args', 'youtube:player_client=android'],
    ['-f', 'b[ext=mp4]/b', '--extractor-args', 'youtube:player_client=ios'],
    ['-f', 'b', '--extractor-args', 'youtube:player_client=web_safari'],
    ['-f', 'b', '--extractor-args', 'youtube:player_client=tv'],
    ['-f', 'b', '--extractor-args', 'youtube:player_client=mweb'],
    // Newer yt-dlp builds need the JS runtime flag for the tv/web clients.
    ['-f', 'b', '--extractor-args', 'youtube:player_client=web_embedded'],
  ];
  let lastErr = null;
  for (const extra of attempts) {
    try {
      await run([...commonArgs(), '--js-runtimes', 'node', '--no-playlist', ...extra, '--merge-output-format', 'mp4', '-o', `${base}.%(ext)s`, src], 240000);
      return await toPlayableMp4(findFile(base));
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('video download failed');
}

/** Resolve a search query to a concrete video URL (best-effort). */
async function resolveUrl(input) {
  if (isUrl(input)) return input;
  const out = await run([...commonArgs(), '--js-runtimes', 'node', '--no-playlist', '--skip-download', '--print', '%(webpage_url)s', asInput(input)], 60000);
  const url = out.trim().split('\n').pop().trim();
  return url || input;
}

/**
 * Audio download with a robust fallback chain (Bug 1: "song download").
 *
 * YouTube refuses datacenter IPs (datacenter hosts and most cloud hosts) with
 * "Sign in to confirm you're not a bot". When that happens we still want the
 * user to get their song, so we try, in order:
 *   1. yt-dlp directly  — works when YT_COOKIES is set, or on a clean IP.
 *   2. a public Invidious/Piped mirror (proxied stream).
 *   3. SoundCloud — searched with the REAL YouTube title (fetched via oEmbed,
 *      which is NOT blocked) so the fallback finds the same song.
 * If everything fails we throw a clear, actionable message instead of a cryptic
 * yt-dlp dump.
 */
async function downloadAudioSmart(input, opts = {}) {
  // 1) JioSaavn FIRST — but only a CONFIDENT match, so we never hand back an
  //    unrelated song when the catalogue only has a partial hit. YouTube refuses
  //    datacenter IPs ("Sign in to confirm you're not a bot") and the public
  //    Invidious/Piped mirrors are mostly dead or behind bot-checks, so JioSaavn
  //    (which serves its CDN from any IP, no key, no cookies) is the reliable one.
  if (!opts.noSaavn) {
    const sa = await trySaavn(input, true);
    if (sa) return sa.file;
  }

  // 2) SoundCloud for plain names (the datacenter YouTube bot-check can't stop it).
  if (!isUrl(input)) {
    for (const q of [String(input).trim()]) {
      const sc = await trySoundCloud(q);
      if (sc) return sc;
    }
  }

  // 3) yt-dlp directly (works when YT_COOKIES is set, or on a clean IP).
  const direct = await tryAudio(input);
  if (direct) return direct;

  // 4) a public Invidious/Piped mirror (proxied stream).
  const viaMirror = await downloadViaMirrorAudio(input).catch(() => null);
  if (viaMirror) return viaMirror;

  // 5) SoundCloud search using the real YouTube title.
  for (const q of await scQueries(input)) {
    const sc = await tryAudio(`scsearch1:${q}`);
    if (sc) return sc;
  }

  // 6) LAST RESORT: a weak JioSaavn match is still better than a hard error.
  if (!opts.noSaavn) {
    const weak = await trySaavn(input, false);
    if (weak) return weak.file;
  }
  throw new Error(blockMsg(input));
}

/**
 * JioSaavn lookup. For a plain song name we search JioSaavn directly; for a
 * YouTube URL we use the real video title (via oEmbed, which is NOT IP-blocked)
 * so the same song is found on JioSaavn. When `requireConfident` is true a weak
 * / partial match returns null so the caller can try another source first.
 * Returns { file, title, artists, album, image, duration, source } or null.
 */
async function trySaavn(input, requireConfident = false) {
  try {
    const s = String(input || '').trim();
    if (!s) return null;
    let query = s;
    if (isUrl(s)) {
      const title = await ytTitle(s);
      if (!title) return null;
      query = cleanTitle(title);
    }
    if (!query || query.length < 2) return null;
    const r = await saavn.downloadSong(query, { requireConfident });
    if (r && r.file && fs.existsSync(r.file)) return r;
  } catch { /* fall through to the other sources */ }
  return null;
}

/**
 * Rich audio download used by `.song` / `.play`. Returns
 * { file, title, artists, album, image, duration, source } so the caller can
 * show the REAL song title + artists instead of the raw query. A confident
 * JioSaavn match wins immediately (fast + accurate); otherwise the full chain
 * runs (yt-dlp / SoundCloud / mirrors) and a weak JioSaavn match is the last
 * resort instead of a hard failure.
 */
async function downloadSongSmart(input) {
  const sa = await trySaavn(input, true);
  if (sa) return sa;
  try {
    const file = await downloadAudioSmart(input, { noSaavn: true });
    return { file, title: null, artists: '', album: '', image: '', duration: 0, source: 'fallback' };
  } catch (e) {
    const weak = await trySaavn(input, false);
    if (weak) return weak;
    throw e;
  }
}

/** downloadAudio that returns null instead of throwing (for the fallback chain). */
async function tryAudio(input) {
  try { return await downloadAudio(input); } catch { return null; }
}

/** Resolve and download a concrete SoundCloud result for a song query. */
async function trySoundCloud(query) {
  try {
    const results = await search(`scsearch1:${query}`, 1);
    const url = results[0]?.url;
    if (url && /soundcloud\.com/i.test(url)) {
      const file = await tryAudio(url);
      if (file) return file;
    }
  } catch { /* fall through to the regular fallback chain */ }
  return tryAudio(`scsearch1:${query}`);
}

/** Strip the noise YouTube titles carry so a SoundCloud search actually hits. */
function cleanTitle(t) {
  return String(t || '')
    .replace(/[(\[].*?[)\]]/g, ' ')                                        // (Official Video) [4K] …
    .replace(/\b(official|video|audio|lyric|lyrics|hd|hq|4k|8k|60fps|mv|m\/v|music\s+video|full\s+song|full\s+video|remaster(ed)?|visualizer|prod\.?)\b/gi, ' ')
    .replace(/[|•]/g, ' ')
    .replace(/\s*[-–—]\s*(topic|vevo)\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Candidate SoundCloud search terms for an input. For a URL we use the real
 * YouTube title (via oEmbed, not IP-blocked) plus a cleaned-up version, so a
 * noisy title like "Song (Official Video) [4K]" still finds the song.
 */
async function scQueries(input) {
  const s = String(input || '').trim();
  if (!isUrl(s)) return [s];
  const title = await ytTitle(s);
  if (!title) return [];
  const cleaned = cleanTitle(title);
  const out = [];
  for (const q of [cleaned, title]) { if (q && q.length > 1 && !out.includes(q)) out.push(q); }
  return out;
}

/** Extract an 11-char YouTube id from any YouTube URL shape. */
function ytId(url) {
  const m = String(url || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** Real video title via YouTube oEmbed — works even when downloads are blocked. */
async function ytTitle(url) {
  try {
    const id = ytId(url);
    if (!id) return null;
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.title ? String(j.title) : null;
  } catch { return null; }
}

/** Human, actionable message for the datacenter-IP YouTube block. */
const YT_BLOCK_MSG =
  'YouTube is blocking this server (bot check). Fix: host env me YT_COOKIES set karo ' +
  '(browser se youtube.com ke cookies export karke Netscape cookies.txt format me) — phir song/video chalega. ' +
  'Ya .play <song name> try karo (SoundCloud se aayega).';

/**
 * Video download. YouTube blocks many datacenter IPs ("Sign in to confirm
 * you're not a bot") — the cookies in config.YT_COOKIES fix most of that.
 * If YouTube still refuses, we report `audio: true` so the caller can be
 * honest with the user instead of silently sending an MP3 when they asked for
 * a video.
 */
async function downloadVideoSmart(input) {
  try {
    return { file: await downloadVideo(input), audio: false };
  } catch (e) {
    // YouTube blocks datacenter IPs even with cookies sometimes. Before giving
    // up, retry through a public Invidious/Piped mirror — those serve the same
    // video from their own IPs, so the block does not apply to us. Free, no key.
    const mirrored = await downloadViaMirror(input).catch(() => null);
    if (mirrored) return { file: mirrored, audio: false };
    // Last resort: a song's audio (JioSaavn first, then SoundCloud) so the user
    // still gets something playable instead of a hard failure.
    const sa = await trySaavn(input);
    if (sa) return { file: sa.file, audio: true, title: sa.title, artists: sa.artists };
    for (const q of await scQueries(input)) {
      const sc = await tryAudio(`scsearch1:${q}`);
      if (sc) return { file: sc, audio: true };
    }
    throw new Error(blockMsg(input));
  }
}

/** A clear, actionable failure message (YouTube-specific when relevant). */
function blockMsg(input) {
  if (!isUrl(input)) {
    return 'Song source unavailable: SoundCloud search/download bhi fail ho gaya. ' +
      'Latest bot deploy/restart karo; YouTube URL ke liye YT_COOKIES set karna zaroori ho sakta hy.';
  }
  return /youtu/i.test(String(input)) ? YT_BLOCK_MSG : 'Download fail — link check karo (private / removed ho sakta hy).';
}

/**
 * Try public YouTube front-ends (Invidious / Piped) when YouTube itself refuses
 * our IP. These are free community mirrors — no API key, no cost. We ask for
 * `local=true` so the mirror PROXIES the media through its own IP (the raw
 * googlevideo URLs are IP-locked and would 403 for us).
 * Returns a local file path, or null when nothing worked.
 */
const MIRRORS = [
  'https://invidious.f5.si',
  'https://invidious.protokolla.fi',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://pipedapi.kavin.rocks',
];

let MIRROR_CACHE = null;

/** Get currently healthy Invidious instances instead of relying only on a
 * hardcoded list (public instances regularly go offline or change domains). */
async function mirrorBases() {
  if (MIRROR_CACHE) return MIRROR_CACHE;
  const out = [...MIRRORS];
  try {
    const r = await fetch('https://api.invidious.io/instances.json?sort_by=health', { signal: AbortSignal.timeout(12000) });
    if (r.ok) {
      const rows = await r.json();
      for (const row of Array.isArray(rows) ? rows : []) {
        const [host, meta] = row || [];
        if (!host || !meta || meta.type !== 'https' || /\.onion$/i.test(host)) continue;
        const base = `https://${host}`;
        if (!out.includes(base)) out.push(base);
        if (out.length >= 24) break;
      }
    }
  } catch { /* use the static list */ }
  MIRROR_CACHE = out;
  return out;
}

/** Resolve a search query to a YouTube id using the first mirror that answers. */
async function mirrorResolveId(query) {
  const s = String(query || '').trim();
  for (const base of await mirrorBases()) {
    try {
      const r = await fetch(`${base}/api/v1/search?q=${encodeURIComponent(s)}&type=video`, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const j = await r.json();
      const first = Array.isArray(j) ? j.find((x) => x && x.videoId) : null;
      if (first) return first.videoId;
    } catch { /* try the next mirror */ }
  }
  return null;
}

/** Fetch a proxied media buffer from a mirror; null on any failure. */
async function mirrorFetch(base, videoId, want) {
  // Piped uses a different API/schema from Invidious. Its stream URLs are
  // already proxied by the instance, which is exactly what we need on a
  // datacenter IP blocked by YouTube.
  const isPiped = /pipedapi\./i.test(base);
  const endpoint = isPiped ? `${base}/streams/${videoId}` : `${base}/api/v1/videos/${videoId}?local=true`;
  const r = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const j = await r.json();
  const list = isPiped
    ? (want === 'audio' ? (j.audioStreams || []) : (j.videoStreams || []))
    : (want === 'audio' ? (j.adaptiveFormats || []) : (j.formatStreams || []));
  const pick = list
    .filter((f) => f && f.url && (want === 'audio'
      ? (isPiped || /audio/.test(f.type || ''))
      : (isPiped ? !f.videoOnly : /video/.test(f.type || ''))))
    .sort((a, b) => (want === 'audio' ? (b.bitrate || b.bitrateKbps || 0) - (a.bitrate || a.bitrateKbps || 0) : (b.height || 0) - (a.height || 0)))[0];
  if (!pick) return null;
  const dl = await fetch(pick.url, { signal: AbortSignal.timeout(120000) });
  if (!dl.ok) return null;
  if (/text\/html/i.test(String(dl.headers.get('content-type') || ''))) return null; // bot-challenge page
  const buf = Buffer.from(await dl.arrayBuffer());
  if (buf.length < 50000) return null;
  return buf;
}

/** Audio (mp3) via a mirror. Returns a local file path or null. */
async function downloadViaMirrorAudio(input) {
  const videoId = ytId(input) || await mirrorResolveId(input);
  if (!videoId) return null;
  for (const base of await mirrorBases()) {
    try {
      const buf = await mirrorFetch(base, videoId, 'audio');
      if (!buf) continue;
      fs.mkdirSync(TMP, { recursive: true });
      const raw = path.join(TMP, `${videoId}.m4a`);
      fs.writeFileSync(raw, buf);
      const mp3 = path.join(TMP, `${videoId}.mp3`);
      if (await media.runFfmpeg(['-y', '-i', raw, '-vn', '-c:a', 'libmp3lame', '-q:a', '5', mp3], 180000)) {
        try { fs.unlinkSync(raw); } catch { /* ignore */ }
        return mp3;
      }
      return raw;
    } catch { /* try the next mirror */ }
  }
  return null;
}

/** Video (mp4) via a mirror. Returns a local file path or null. */
async function downloadViaMirror(input) {
  const videoId = ytId(input) || await mirrorResolveId(input);
  if (!videoId) return null;
  for (const base of await mirrorBases()) {
    try {
      const buf = await mirrorFetch(base, videoId, 'video');
      if (!buf) continue;
      fs.mkdirSync(TMP, { recursive: true });
      const file = path.join(TMP, `${videoId}.mp4`);
      fs.writeFileSync(file, buf);
      return await toPlayableMp4(file);
    } catch { /* try the next mirror */ }
  }
  return null;
}

/** Best-effort cleanup of stale temp files. */
function cleanup(maxAgeMs = 30 * 60 * 1000) {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(TMP)) {
      const p = path.join(TMP, f);
      try { if (now - fs.statSync(p).mtimeMs > maxAgeMs) fs.unlinkSync(p); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/** Pre-fetch the binaries in the background so the first download is fast. */
async function warmup() {
  try {
    const [y] = await Promise.all([ensureYtDlp(), media.ensureFfmpeg().catch(() => null)]);
    console.log(`[YTDLP] warmup: yt-dlp=${y ? 'ready' : 'missing'} ffmpeg=${media.ffmpegPath() ? 'ready' : 'missing'}`);
  } catch { /* ignore */ }
}

module.exports = {
  available, info, search, downloadAudio, downloadVideo, downloadAudioSmart, downloadSongSmart, downloadVideoSmart,
  resolveUrl, isUrl, cleanup, warmup, ensureYtDlp,
};
