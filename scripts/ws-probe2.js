const WebSocket = require('ws');
const URL = 'wss://web.whatsapp.com/ws/chat';
const ORIGIN = 'https://web.whatsapp.com';
const RUN_MS = 70000;
const PING_MS = Number(process.argv[2] || 4000);
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
let opens = 0, closes = 0, pings = 0;

function connect() {
  const ws = new WebSocket(URL, { origin: ORIGIN, handshakeTimeout: 30000, timeout: 30000 });
  let timer = null;
  ws.on('open', () => {
    opens++; console.log(`[${el()}] OPEN #${opens} (ping every ${PING_MS}ms)`);
    if (PING_MS > 0) timer = setInterval(() => { try { ws.ping(); pings++; } catch {} }, PING_MS);
  });
  ws.on('error', (e) => console.log(`[${el()}] ERROR code=${e.code || '-'} msg=${e.message}`));
  ws.on('close', (code) => {
    closes++; if (timer) clearInterval(timer);
    console.log(`[${el()}] CLOSE code=${code}`);
    if (Date.now() - t0 < RUN_MS) setTimeout(connect, 800);
  });
  ws.on('pong', () => {});
}
connect();
setTimeout(() => { console.log(`\n=== opens=${opens} closes=${closes} pings=${pings} over ${el()} ===`); process.exit(0); }, RUN_MS);
