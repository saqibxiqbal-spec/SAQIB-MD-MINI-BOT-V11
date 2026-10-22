/**
 * Verify that a Baileys socket survives the sandbox's ~10s idle drop when
 * keepAliveIntervalMs is lowered below that window.
 */
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const KEEPALIVE = Number(process.argv[2] || 5000);
const RUN_MS = 80000;
const dir = path.join('/tmp', 'probe-auth-' + Date.now());
fs.mkdirSync(dir, { recursive: true });

(async () => {
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();
  const t0 = Date.now();
  const el = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
  let closes = 0, opens = 0, qrs = 0;

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
    keepAliveIntervalMs: KEEPALIVE,
    connectTimeoutMs: 30000,
    defaultQueryTimeoutMs: 30000,
  });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    if (u.qr) { qrs++; console.log(`[${el()}] qr #${qrs}`); }
    if (u.connection === 'open') { opens++; console.log(`[${el()}] OPEN`); }
    if (u.connection === 'close') {
      closes++;
      const code = u.lastDisconnect?.error?.output?.statusCode;
      const msg = u.lastDisconnect?.error?.message;
      console.log(`[${el()}] CLOSE statusCode=${code} msg=${msg}`);
    }
  });

  setTimeout(() => {
    console.log(`\n=== keepAlive=${KEEPALIVE}ms opens=${opens} closes=${closes} qrs=${qrs} over ${el()} ===`);
    try { sock.end(undefined); } catch {}
    process.exit(0);
  }, RUN_MS);
})();
