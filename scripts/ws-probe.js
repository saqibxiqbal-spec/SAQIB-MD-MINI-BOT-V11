/**
 * Raw WebSocket probe — is the sandbox's network to WhatsApp stable?
 * Opens the same socket Baileys opens and reports every close/error with
 * timing, so we can tell an ENVIRONMENT drop (ECONNRESET/ETIMEDOUT) apart
 * from a Baileys logic bug.
 */
const WebSocket = require('ws');

const URL = 'wss://web.whatsapp.com/ws/chat';
const ORIGIN = 'https://web.whatsapp.com';
const RUN_MS = 150000;

const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';

let opens = 0;
let closes = 0;

function connect() {
  const ws = new WebSocket(URL, {
    origin: ORIGIN,
    handshakeTimeout: 30000,
    timeout: 30000,
  });
  ws.on('open', () => { opens++; console.log(`[${el()}] OPEN #${opens}`); });
  ws.on('error', (e) => console.log(`[${el()}] ERROR code=${e.code || '-'} msg=${e.message}`));
  ws.on('close', (code, reason) => {
    closes++;
    console.log(`[${el()}] CLOSE code=${code} reason=${reason && reason.toString().slice(0, 80)}`);
    if (Date.now() - t0 < RUN_MS) {
      console.log(`[${el()}] reconnecting in 1s…`);
      setTimeout(connect, 1000);
    }
  });
  ws.on('unexpected-response', (_req, res) => {
    console.log(`[${el()}] UNEXPECTED-RESPONSE status=${res.statusCode}`);
  });
  ws.on('ping', () => console.log(`[${el()}] ping`));
  ws.on('pong', () => console.log(`[${el()}] pong`));
}

connect();
setTimeout(() => {
  console.log(`\n=== SUMMARY opens=${opens} closes=${closes} over ${el()} ===`);
  process.exit(0);
}, RUN_MS);
