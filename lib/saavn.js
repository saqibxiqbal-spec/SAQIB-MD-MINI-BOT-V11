/**
 * SAQIB MD — JioSaavn song source
 * -------------------------------
 * YouTube blocks datacenter IPs ("Sign in to confirm you're not a bot"), which
 * is why `.song <name>` used to fail on cloud hosts. JioSaavn (the big
 * Bollywood / Urdu / Punjabi / Hindi catalogue) serves its CDN straight from
 * any IP, needs no API key and no cookies, and answers in ~1s — so it is now the
 * FIRST source tried for song downloads, with SoundCloud and YouTube as backup.
 *
 * The media URL comes DES-encrypted in `encrypted_media_url`; lib/des.js
 * decrypts it in pure JS (Node 20's OpenSSL 3 has DES disabled by default).
 *
 *   search('Tum Hi Ho', 5)   -> [{ id, title, artists, album, image, duration, … }]
 *   downloadSong('Tum Hi Ho') -> { file, title, artists, album, image, duration }
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { desDecryptBase64 } = require('./des');
const media = require('./media');

const TMP = path.join(process.env.TMP_DIR || os.tmpdir(), 'saqib-dl');
const API = 'https://www.jiosaavn.com/api.php';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** Decode the HTML entities JioSaavn sprinkles through its titles. */
function decodeEntities(s) {
  return String(s || '')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

async function callApi(query) {
  const url = `${API}?${query}&_format=json&_marker=0&api_version=4&ctx=web6dot0`;
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`saavn http ${r.status}`);
  let text = await r.text();
  // Some edges wrap the payload in a JSONP callback — strip it.
  const brace = text.indexOf('{');
  if (brace > 0) text = text.slice(brace);
  return JSON.parse(text);
}

function normalize(r) {
  const mi = r.more_info || {};
  const primary = mi.artistMap?.primary_artists?.map((a) => a.name).filter(Boolean).join(', ');
  const featured = mi.artistMap?.featured_artists?.map((a) => a.name).filter(Boolean).join(', ');
  const artists = decodeEntities(primary || featured || mi.music || mi.singers || '');
  return {
    id: r.id,
    title: decodeEntities(r.title),
    subtitle: decodeEntities(r.subtitle),
    artists,
    album: decodeEntities(mi.album || ''),
    image: String(r.image || '').replace('150x150', '500x500'),
    duration: Number(mi.duration) || 0,
    language: r.language || '',
    year: r.year || '',
    permaUrl: r.perma_url || '',
    type: r.type || 'song',
  };
}

/** Search songs. Returns [] on any failure (never throws). */
async function search(query, limit = 5) {
  try {
    const j = await callApi(`__call=search.getResults&q=${encodeURIComponent(query)}&n=${limit}&p=1`);
    const rows = Array.isArray(j.results) ? j.results : [];
    return rows
      .filter((r) => r && r.id && (r.type === 'song' || r.more_info?.duration))
      .map(normalize);
  } catch { return []; }
}

/**
 * Resolve a song id to its decrypted 320kbps (fallback 96kbps) CDN URL.
 * JioSaavn answers in two shapes depending on the edge: `{ "<id>": {…} }` or
 * `{ "songs": [ {…} ] }`, and the encrypted URL lives either at the top level
 * or inside `more_info` — handle all four combinations.
 */
async function mediaUrl(id) {
  const j = await callApi(`__call=song.getDetails&cc=in&pids=${encodeURIComponent(id)}`);
  const info = j[id] || (Array.isArray(j.songs) ? j.songs.find((s) => s.id === id) || j.songs[0] : null);
  if (!info) return null;
  const enc = info.encrypted_media_url || info.more_info?.encrypted_media_url
    || info.encrypted_drm_media_url || info.more_info?.encrypted_drm_media_url;
  if (!enc) return null;
  const u96 = desDecryptBase64(enc);
  if (!/^https?:/i.test(u96)) return null;
  return { url320: u96.replace('_96.mp4', '_320.mp4'), url96: u96 };
}

/** Lowercase, strip punctuation, collapse whitespace. */
function normText(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Score a candidate against the typed query AND report how confident the match
 * is. `coverage` = fraction of the query's words present in the song's
 * title/artists/album. `confident` is true when the song clearly IS what was
 * asked for (the query contains the whole title, the title contains the whole
 * query, or nearly every query word is present) — so a weak/partial match can
 * be skipped in favour of another source instead of returning the wrong song.
 */
function scoreSong(query, song) {
  const q = normText(query);
  const words = q.split(' ').filter((w) => w.length > 1);
  const title = normText(song.title);
  const hay = normText(`${song.title} ${song.subtitle} ${song.artists} ${song.album}`);
  let score = 0;
  let matched = 0;
  for (const w of words) if (hay.includes(w)) { score += 10; matched++; }
  if (title.includes(q)) score += 25;
  if (q.includes(title) && title.length >= 3) score += 25;
  if (words.length && matched === words.length) score += 20;
  // Leading-words bonus: the title starts with the first two query words.
  const lead = words.slice(0, 2).join(' ');
  if (lead.length >= 5 && title.startsWith(lead)) score += 15;
  if (song.type === 'song') score += 5;
  const coverage = words.length ? matched / words.length : 0;
  const confident = (title.length >= 3 && (q.includes(title) || title.includes(q))) || coverage >= 0.6;
  return { score, coverage, confident };
}

/** Numeric relevance score (kept for callers that only need the number). */
function score(query, song) { return scoreSong(query, song).score; }

function bestMatch(query, songs) {
  if (!songs.length) return null;
  return songs.map((s) => ({ s, ...scoreSong(query, s) })).sort((a, b) => b.score - a.score)[0].s;
}

/** Download a buffer from a URL with a browser UA; null on failure. */
async function fetchBuf(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 30000) return null; // too small to be a real track
    return buf;
  } catch { return null; }
}

/**
 * Download a song as an MP3. Tries the 320kbps URL, then 96kbps, then a
 * different search hit. Returns { file, title, artists, album, image, duration }
 * or null.
 *
 * `opts.requireConfident` makes it return null (instead of a wrong song) when
 * the best hit is only a weak/partial match — the caller can then try another
 * source before falling back to this one.
 */
async function downloadSong(query, opts = {}) {
  const songs = await search(query, 8);
  if (!songs.length) return null;
  const ordered = songs.map((s) => ({ s, ...scoreSong(query, s) })).sort((a, b) => b.score - a.score);
  if (opts.requireConfident && !ordered[0].confident) return null;

  for (const { s: song } of ordered.slice(0, 3)) {
    let urls = null;
    try { urls = await mediaUrl(song.id); } catch { urls = null; }
    if (!urls) continue;
    let buf = await fetchBuf(urls.url320);
    if (!buf) buf = await fetchBuf(urls.url96);
    if (!buf) continue;

    fs.mkdirSync(TMP, { recursive: true });
    const base = path.join(TMP, `saavn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const raw = `${base}.m4a`;
    const mp3 = `${base}.mp3`;
    fs.writeFileSync(raw, buf);
    // Transcode to MP3 so the rest of the pipeline (and WhatsApp) is happy.
    const ok = await media.runFfmpeg(['-y', '-i', raw, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', mp3], 180000);
    try { fs.unlinkSync(raw); } catch { /* ignore */ }
    const file = ok && fs.existsSync(mp3) ? mp3 : raw;
    return { file, title: song.title, artists: song.artists, album: song.album, image: song.image, duration: song.duration, source: 'JioSaavn' };
  }
  return null;
}

module.exports = { search, mediaUrl, downloadSong, bestMatch, scoreSong, decodeEntities };
