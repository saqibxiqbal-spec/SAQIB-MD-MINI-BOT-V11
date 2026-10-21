/**
 * Live audit — actually exercises the network-dependent fixes.
 *   Problem 6: image generation (validate real image bytes)
 *   Problem 7: video download (YouTube block / cookies / mirrors)
 * Run: node scripts/live-audit.js
 */
const path = require('path');

async function testImageGen() {
  console.log('\n=== PROBLEM 6: image generation ===');
  let imagegen;
  try { imagegen = require('../lib/imagegen'); }
  catch (e) { console.log('  ❌ cannot load imagegen:', e.message); return; }
  const t0 = Date.now();
  try {
    const buf = await imagegen.generateImage('a cute cyberpunk cat, neon lights', { user: 'audit' });
    const ms = Date.now() - t0;
    const ok = imagegen.isRealImage(buf);
    console.log(`  ${ok ? '✅' : '❌'} got ${buf.length} bytes in ${ms}ms — isRealImage=${ok}`);
    if (ok) {
      const head = buf.slice(0, 4).toString('hex');
      console.log(`     magic: ${head} (ffd8ff=JPEG, 89504e47=PNG)`);
    }
  } catch (e) {
    console.log(`  ❌ generateImage threw after ${Date.now() - t0}ms: ${e.message}`);
  }
}

async function testVideo() {
  console.log('\n=== PROBLEM 7: video download (YouTube) ===');
  let ytdlp;
  try { ytdlp = require('../lib/ytdlp'); }
  catch (e) { console.log('  ❌ cannot load ytdlp:', e.message); return; }
  console.log('  exports:', Object.keys(ytdlp).join(', '));
  const t0 = Date.now();
  try {
    // A short, stable, well-known video id
    const file = await ytdlp.downloadVideo('https://youtu.be/dQw4w9WgXcQ');
    const fs = require('fs');
    const size = fs.statSync(file).size;
    console.log(`  ✅ downloadVideo -> ${path.basename(file)} (${(size/1048576).toFixed(2)} MB) in ${Date.now()-t0}ms`);
  } catch (e) {
    console.log(`  ❌ downloadVideo threw after ${Date.now()-t0}ms: ${e.message}`);
  }
}

(async () => {
  console.log('yt-dlp available:', await (async () => {
    try { const { execSync } = require('child_process'); return execSync('which yt-dlp || echo MISSING').toString().trim(); }
    catch { return 'MISSING'; }
  })());
  await testImageGen();
  await testVideo();
  console.log('\n=== live audit done ===');
})();
