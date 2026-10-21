/**
 * SAQIB MD — media binary resolver (ffmpeg)
 * ----------------------------------------
 * The downloader needs ffmpeg for two things:
 *   • merging separate video+audio streams into one MP4 (yt-dlp calls it)
 *   • converting/extracting audio (mp3) and remuxing to a WhatsApp-playable MP4
 *
 * On a Docker host (our Dockerfile) ffmpeg is installed with apt, so it is just
 * on PATH. But many people deploy by connecting GitHub to a plain Node host
 * (a plain Node host, Vercel, a bare VPS…) where apt is NOT available and
 * ffmpeg is MISSING — that is exactly why song / TikTok / Facebook downloads
 * silently failed. This resolver finds ffmpeg no matter what:
 *
 *   1. FFMPEG_PATH env override
 *   2. the `ffmpeg-static` npm package (its binary is downloaded at build time)
 *   3. the system PATH (Docker image)
 *   4. a one-time runtime download of a single gzipped binary (last resort)
 *
 * ffprobe is optional: when it is missing we probe with ffmpeg itself, so we
 * never hard-depend on a second binary.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFile } = require('child_process');

const BIN_DIR = process.env.SAQIB_BIN_DIR || path.join(os.tmpdir(), 'saqib-bin');
// eugeneware/ffmpeg-static ships each platform as a SINGLE gzipped binary — no
// tar, no xz — so we can fetch + gunzip it with nothing but Node's zlib.
const FFMPEG_GZ = process.env.FFMPEG_URL
  || 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-linux-x64.gz';

function which(bin) {
  const paths = (process.env.PATH || '').split(':');
  for (const p of paths) {
    try { if (p && fs.existsSync(path.join(p, bin))) return path.join(p, bin); } catch { /* ignore */ }
  }
  return null;
}

let _ffmpeg = null;
let _ffmpegChecked = false;

/** Synchronous best-effort resolution of the ffmpeg binary (may be null). */
function ffmpegPath() {
  if (_ffmpegChecked) return _ffmpeg;
  _ffmpegChecked = true;
  // 1) explicit override
  const env = process.env.FFMPEG_PATH;
  if (env && fs.existsSync(env)) return (_ffmpeg = env);
  // 2) npm static package (built into the slug on Node hosts)
  try {
    const p = require('ffmpeg-static');
    if (p && fs.existsSync(p)) return (_ffmpeg = p);
  } catch { /* not installed */ }
  // 3) system PATH (Docker image)
  const sys = which('ffmpeg');
  if (sys) return (_ffmpeg = sys);
  // 4) a previously downloaded copy in the temp bin dir
  const local = path.join(BIN_DIR, 'ffmpeg');
  if (fs.existsSync(local)) return (_ffmpeg = local);
  return (_ffmpeg = null);
}

/** Directory that contains the resolved ffmpeg (for yt-dlp --ffmpeg-location). */
function ffmpegDir() {
  const p = ffmpegPath();
  return p ? path.dirname(p) : null;
}

/**
 * Ensure ffmpeg exists, downloading a static binary on first use when the host
 * has neither apt nor the npm package. Returns the path (or null on failure).
 */
async function ensureFfmpeg() {
  const found = ffmpegPath();
  if (found) return found;
  try {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    const local = path.join(BIN_DIR, 'ffmpeg');
    if (fs.existsSync(local)) { _ffmpegChecked = false; return ffmpegPath(); }
    const r = await fetch(FFMPEG_GZ, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
    if (!r.ok) return null;
    const gz = Buffer.from(await r.arrayBuffer());
    const bin = zlib.gunzipSync(gz);
    fs.writeFileSync(local, bin);
    fs.chmodSync(local, 0o755);
    _ffmpegChecked = false;   // re-resolve so ffmpegPath() now sees the download
    return ffmpegPath();
  } catch (e) {
    console.error('[MEDIA] ffmpeg bootstrap failed:', e?.message || e);
    return null;
  }
}

/** Run ffmpeg with the given args; resolves true on success. */
function runFfmpeg(args, timeoutMs = 600000) {
  return new Promise((resolve) => {
    const bin = ffmpegPath();
    if (!bin) return resolve(false);
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 32 }, (err) => resolve(!err));
  });
}

/**
 * Probe a media file WITHOUT ffprobe: `ffmpeg -i file` prints the container and
 * stream info to stderr (and then exits non-zero because there is no output).
 * We parse that text for duration + video/audio codec.
 */
function probe(file) {
  return new Promise((resolve) => {
    const bin = ffmpegPath();
    if (!bin || !file || !fs.existsSync(file)) return resolve({ duration: 0, vcodec: '', acodec: '' });
    execFile(bin, ['-hide_banner', '-i', file], { timeout: 25000, maxBuffer: 1024 * 1024 * 8 }, (_err, _so, se) => {
      const text = String(se || '');
      const dm = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      const duration = dm ? Math.round((+dm[1]) * 3600 + (+dm[2]) * 60 + (+dm[3])) : 0;
      const vm = text.match(/Stream #\d+:\d+.*?:\s*Video:\s*([a-zA-Z0-9_]+)/);
      const am = text.match(/Stream #\d+:\d+.*?:\s*Audio:\s*([a-zA-Z0-9_]+)/);
      resolve({ duration, vcodec: (vm ? vm[1] : '').toLowerCase(), acodec: (am ? am[1] : '').toLowerCase() });
    });
  });
}

module.exports = {
  ffmpegPath,
  ffmpegDir,
  ensureFfmpeg,
  runFfmpeg,
  probe,
  which,
  BIN_DIR,
};
