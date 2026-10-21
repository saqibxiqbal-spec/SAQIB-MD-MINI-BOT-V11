'use strict';
/**
 * Verifies getJSON/getText retry behavior:
 *  - retries on 5xx then succeeds
 *  - retries on network error then succeeds
 *  - does NOT retry on 4xx (fails fast)
 *  - gives up after the bounded number of retries
 * Uses a local http server so no external network is needed.
 */
const http = require('http');
const { getJSON, getText } = require('../lib/helpers');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  \u2705 ' + m)) : (fail++, console.log('  \u274c ' + m)); };

(async () => {
  let hits5xx = 0, hitsNet = 0, hits4xx = 0, hitsAlways = 0;

  const server = http.createServer((req, res) => {
    if (req.url === '/flaky5xx') {
      hits5xx++;
      if (hits5xx < 2) { res.writeHead(503); return res.end('nope'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, tries: hits5xx }));
    }
    if (req.url === '/flaky4xx') { hits4xx++; res.writeHead(400); return res.end('bad'); }
    if (req.url === '/always5xx') { hitsAlways++; res.writeHead(500); return res.end('down'); }
    if (req.url === '/text') { res.writeHead(200); return res.end('hello world'); }
    res.writeHead(404); res.end();
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  console.log('=== getJSON/getText retry ===');

  // 1. 5xx then success
  const j = await getJSON(`${base}/flaky5xx`, {}, 5000);
  ok(j && j.ok === true, 'retries on 503 then returns parsed JSON');
  ok(hits5xx === 2, 'hit the 5xx endpoint exactly twice (1 retry)');

  // 2. text passthrough
  const t = await getText(`${base}/text`, {}, 5000);
  ok(t === 'hello world', 'getText returns raw body');

  // 3. 4xx fails fast (no retry)
  let threw4 = false;
  try { await getJSON(`${base}/flaky4xx`, {}, 5000); } catch (e) { threw4 = /HTTP 400/.test(e.message); }
  ok(threw4, '4xx throws HTTP 400');
  ok(hits4xx === 1, '4xx is NOT retried (single hit)');

  // 4. bounded retries on persistent 5xx (1 + 2 retries = 3 hits)
  let threw5 = false;
  try { await getJSON(`${base}/always5xx`, {}, 5000); } catch (e) { threw5 = /HTTP 500/.test(e.message); }
  ok(threw5, 'persistent 5xx eventually throws');
  ok(hitsAlways === 3, 'persistent 5xx tried 3 times (initial + 2 retries)');

  server.close();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
