/**
 * Verifies the DATABASE-DRIVEN downloader API call format.
 *
 * Regression guard for the WhiteShadow API: `whiteshadow-x-api.onrender.com`
 * only accepts the key as a `key=` query param or the `x-api-key` header —
 * NEVER `apikey=`. We therefore send the key every way at once so any provider
 * (WhiteShadow, tikwm, custom) works without code changes.
 */
process.env.MONGODB_URI = ''; // stay offline / local-file only

const assert = require('assert');
const apikeys = require('../lib/apikeys');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name); } };

// ---- capture the outgoing request -----------------------------------------
let captured = null;
global.fetch = async (url, opts = {}) => {
  captured = { url: String(url), headers: opts.headers || {} };
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { title: 'Test', url: 'https://cdn.example.com/v.mp4', music: 'https://cdn.example.com/a.mp3' } }),
    text: async () => '',
  };
};

const downloader = require('../plugins/downloader');

(async () => {
  console.log('\n=== DOWNLOADER API KEY FORMAT ===');

  // Simulate `.setapikey youtube KEY https://whiteshadow-x-api.onrender.com/api/ytmp3`
  apikeys.set('youtube', 'WS-SECRET-123', 'https://whiteshadow-x-api.onrender.com/api/ytmp3');

  const res = await downloader._apiResolve('youtube', 'https://youtu.be/dQw4w9WgXcQ');

  ok('apiResolve returns a video url', !!(res && res.video === 'https://cdn.example.com/v.mp4'));
  ok('apiResolve returns an audio url', !!(res && res.music === 'https://cdn.example.com/a.mp3'));
  ok('request was actually made', !!captured);
  ok('URL contains the endpoint path', /whiteshadow-x-api\.onrender\.com\/api\/ytmp3/.test(captured.url));
  ok('URL passes the source url', /[?&]url=https%3A%2F%2Fyoutu\.be%2FdQw4w9WgXcQ/.test(captured.url));
  ok('URL carries apikey= (generic providers)', /[?&]apikey=WS-SECRET-123/.test(captured.url));
  ok('URL carries key= (WhiteShadow)', /[?&]key=WS-SECRET-123/.test(captured.url));
  ok('header x-api-key is sent (WhiteShadow)', captured.headers['x-api-key'] === 'WS-SECRET-123');
  ok('title parsed', res.title === 'Test');

  // Endpoint that already has a query string must use '&'
  apikeys.set('tiktok', 'TK-1', 'https://api.example.com/dl?format=json');
  await downloader._apiResolve('tiktok', 'https://x/y');
  ok('endpoint with existing ? uses & separator', /dl\?format=json&url=/.test(captured.url));

  // No key set -> returns null, no request
  captured = null;
  apikeys.remove('facebook');
  const none = await downloader._apiResolve('facebook', 'https://x/y');
  ok('no key -> null', none === null);
  ok('no key -> no request made', captured === null);

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
