/* Verify the downloader bootstrap: resolve/download yt-dlp + ffmpeg, then run. */
const media = require('../lib/media');
const ytdlp = require('../lib/ytdlp');
const { execFileSync } = require('child_process');

(async () => {
  console.log('--- before ---');
  console.log('ffmpegPath:', media.ffmpegPath());
  console.log('available:', ytdlp.available());

  console.log('--- ensuring yt-dlp ---');
  const y = await ytdlp.ensureYtDlp();
  console.log('yt-dlp:', y);

  console.log('--- ensuring ffmpeg ---');
  const f = await media.ensureFfmpeg();
  console.log('ffmpeg:', f);

  if (y) {
    const { execFileSync } = require('child_process');
    console.log('yt-dlp --version:', execFileSync(y, ['--version']).toString().trim());
  }
  if (f) {
    const { execFileSync } = require('child_process');
    console.log('ffmpeg version:', execFileSync(f, ['-version']).toString().split('\n')[0]);
  }

  console.log('--- probe self-test (ffmpeg) ---');
  // make a tiny test tone with ffmpeg, then probe it
  if (f) {
    const os = require('os'); const path = require('path');
    const out = path.join(os.tmpdir(), 'saqib_probe_test.mp3');
    try {
      execFileSync(f, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', out], { stdio: 'ignore' });
      const p = await media.probe(out);
      console.log('probe:', p);
    } catch (e) { console.log('probe test err:', e.message); }
  }
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
