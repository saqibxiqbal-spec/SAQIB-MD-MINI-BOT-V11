/**
 * Probe the pairing flow against real WhatsApp servers.
 * Usage: node test/pair-probe.js <number> [mode]
 *   mode = "early" (current buggy behaviour: request code immediately)
 *   mode = "qr"    (fixed behaviour: request code on first qr event)
 */
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const number = String(process.argv[2] || '').replace(/[^0-9]/g, '');
const mode = process.argv[3] || 'early';
const dir = path.join('/tmp', 'pair-probe-' + number + '-' + mode);
fs.rmSync(dir, { recursive: true, force: true });

const logger = pino({ level: 'silent' });

(async () => {
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  let version;
  try { ({ version } = await fetchLatestBaileysVersion()); } catch {}
  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    auth: { creds: state.creds, keys: state.keys },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 30000,
    keepAliveIntervalMs: 20000,
    retryRequestDelayMs: 250,
  });

  let codeRequested = false;
  const askCode = async (why) => {
    if (codeRequested) return;
    codeRequested = true;
    console.log(`>>> requesting pairing code (${why}) ...`);
    try {
      const code = await sock.requestPairingCode(number);
      console.log(`>>> CODE = ${code}`);
    } catch (e) {
      console.log(`>>> code request FAILED (${why}):`, e?.message || e);
      codeRequested = false;
    }
  };

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr, isNewLogin } = u;
    const sc = lastDisconnect?.error?.output?.statusCode;
    console.log('UPDATE', JSON.stringify({ connection, qr: qr ? 'yes' : undefined, isNewLogin, statusCode: sc, registered: sock.authState?.creds?.registered, me: sock.authState?.creds?.me?.id || null }));
    if (isNewLogin) console.log('>>> isNewLogin (code accepted)');
    if (qr && mode === 'qr') askCode('on qr');
    if (connection === 'open') { console.log('>>> OPEN — PAIRED OK'); process.exit(0); }
    if (connection === 'close') {
      if (sc === DisconnectReason.loggedOut || sc === 401) {
        console.log('>>> 401 loggedOut — would be terminal');
        if (mode === 'qr') { console.log('>>> (qr mode) NOT terminal during pairing, will retry'); }
      }
    }
  });

  if (mode === 'early') {
    // BUGGY: request immediately, before the socket is open.
    askCode('early/immediately');
  }

  setTimeout(() => { console.log('>>> timeout, exiting'); process.exit(0); }, 40000);
})();
