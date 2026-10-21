#!/usr/bin/env node
/**
 * Live end-to-end downloader test (Bug 1 + Bug 2).
 *
 * Exercises the SAME public API the bot's .play / .ytmp4 / .tiktok commands use
 * (lib/ytdlp.downloadAudioSmart / downloadVideoSmart + lib/media), including the
 * datacenter-IP fallback chain.
 *
 * Run: node test/dl-live.js
 */
const fs = require('fs');
const path = require('path');
const ytdlp = require('../lib/ytdlp');
const media = require('../lib/media');

const SONG_URL = process.env.TEST_SONG_URL || "https://www.youtube.com/watch?v=kJQP7kiw5Fk"; // Despacito
const SONG_NAME = process.env.TEST_SONG_NAME || 'flickermood forss';
const TIKTOK = process.env.TEST_TIKTOK_URL || 'https://www.tiktok.com/@tiktok/video/7106594312292453675';

(async () => {
  let pass = 0, fail = 0;
  const check = (n, c, e = '') => { if (c) { pass++; console.log(`  \u2705 ${n}`); } else { fail++; console.log(`  \u274c ${n} ${e}`); } };

  console.log('\n1) binaries');
  check('yt-dlp available', ytdlp.available() === true);
  check('ffmpeg resolved', !!media.ffmpegPath(), String(media.ffmpegPath()));

  console.log('\n2) song by NAME — .play <song> (SoundCloud path, no YouTube needed)');
  try {
    const f = await ytdlp.downloadAudioSmart(SONG_NAME);
    const size = f && fs.existsSync(f) ? fs.statSync(f).size : 0;
    check('audio file produced', !!f && size > 10000, `file=${f} size=${size}`);
    if (f) { const p = await media.probe(f); check('audio probed (duration>0)', !!p && p.duration > 0, JSON.stringify(p)); }
  } catch (e) { fail++; console.log('  \u274c ' + e.message); }

  console.log('\n3) song by YOUTUBE URL — .play <yt link> (fallback chain)');
  try {
    const f = await ytdlp.downloadAudioSmart(SONG_URL);
    const size = f && fs.existsSync(f) ? fs.statSync(f).size : 0;
    check('audio file produced (direct or fallback)', !!f && size > 10000, `file=${f} size=${size}`);
  } catch (e) { fail++; console.log('  \u274c ' + e.message); }

  console.log('\n4) TikTok video — .tiktok <link> (works from datacenter IP)');
  try {
    const r = await ytdlp.downloadVideoSmart(TIKTOK);
    const size = r.file && fs.existsSync(r.file) ? fs.statSync(r.file).size : 0;
    check('video file produced', !!r.file && size > 20000, `file=${r.file} size=${size} audio=${r.audio}`);
  } catch (e) { fail++; console.log('  \u274c ' + e.message); }

  console.log(`\n${fail === 0 ? '\u2705 ALL PASS' : '\u274c FAILURES'} \u2014 ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
