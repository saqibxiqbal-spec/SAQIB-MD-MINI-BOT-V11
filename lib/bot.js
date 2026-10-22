/**
 * SAQIB MD — bot lifecycle (multi-session: connect, pair, reconnect, events)
 * ---------------------------------------------------------------------------
 * MULTI-SESSION
 *   Up to config.MAX_SESSIONS (default 500) different WhatsApp numbers can be
 *   linked at the same time. Each number gets its own auth folder
 *   (SESSION_DIR/<number>) and its own socket. The number that links a session
 *   becomes that session's OWNER.
 *
 * THE "could not link device" FIX
 *   When the user types the pairing code, WhatsApp sends a `pair-success`
 *   stanza and then IMMEDIATELY closes the socket with stream:error 515
 *   ("restart required"). That is NOT an error — reopen the connection using
 *   the freshly-issued credentials. We persist creds to disk and, on ANY
 *   non-fatal close while linking, reconnect IMMEDIATELY (no backoff).
 *
 * SPEED
 *   cachedGroupMetadata, shouldIgnoreJid, syncFullHistory:false,
 *   emitOwnEvents:false, low retry delay, cached Baileys version, and
 *   fire-and-forget presence so commands reply instantly.
 */
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const config = require('../config');
const { handleMessage } = require('./handler');
const { cleanNumber, formatDuration, normalizePhone, validatePhone } = require('./helpers');
const { msgStore } = require('./cache');
const debug = require('./debug');
const { restoreFromSessionId } = require('./sessionid');
const reactSettings = require('./reactSettings');
const sessionStore = require('./sessionStore');

const logger = pino({ level: 'silent' });

// Live pairing events (consumed by the SSE endpoint in index.js).
// Every payload includes `number` so the portal can filter per session.
const events = new EventEmitter();
events.setMaxListeners(0);

const MAX_RESTARTS = 6;
const RESTART_DELAY_MS = 200;

const startedAt = Date.now();

// number -> session
const sessions = new Map();

// ---- Baileys version cache (skip the network round-trip on restarts) ----
let cachedVersion = null;
let versionFetched = false;
async function getVersion() {
  if (versionFetched) return cachedVersion;
  try { ({ version: cachedVersion } = await fetchLatestBaileysVersion()); } catch { cachedVersion = undefined; }
  versionFetched = true;
  return cachedVersion;
}

function sessionDir(number) {
  return path.join(path.resolve(config.SESSION_DIR), String(number));
}

function newSession(number) {
  return {
    number: String(number),
    sock: null,
    status: 'unpaired', // unpaired | pairing | connecting | connected | error
    code: null,
    lastError: null,
    since: null,
    me: null,
    startedAt: Date.now(),
    // pairing bookkeeping
    codeSent: false,
    restarts: 0,
    everOpened: false,
    restarting: false,
    reconnectAttempts: 0,
    pairNumber: null,
    pairResolve: null,
    pairReject: null,
    startPromise: null,
    ownerNumber: String(number), // the number that linked this session owns it
    lastUpdate: Date.now(), // last connection.update timestamp (watchdog)
    watchdogRestarts: 0,    // how many times the watchdog force-restarted us
    pairingSince: 0,        // when this session entered 'pairing' (zombie guard)
    lastQr: null,           // latest raw Baileys QR string (for scan-to-link)
    qrAt: 0,                // when lastQr was received
  };
}

// ---- group metadata cache (speed) ----
const groupCache = new Map();
async function cachedGroupMetadata(jid) {
  const hit = groupCache.get(jid);
  if (hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.v;
  const s = getSock();
  if (!s) throw new Error('no socket');
  const v = await s.groupMetadata(jid);
  groupCache.set(jid, { v, t: Date.now() });
  return v;
}

function resetSessionDir(number) {
  try { fs.rmSync(sessionDir(number), { recursive: true, force: true }); } catch { /* ignore */ }
  groupCache.clear();
}

function failPair(session, err) {
  if (session.pairReject) {
    const r = session.pairReject;
    session.pairResolve = null;
    session.pairReject = null;
    r(err);
  }
}

/** Create a fresh socket for a session and attach every listener */
async function createSocket(session) {
  const dir = sessionDir(session.number);
  fs.mkdirSync(dir, { recursive: true });

  const { state: auth, saveCreds } = await useMultiFileAuthState(dir);
  const version = await getVersion();

  if (auth.creds.registered && auth.creds.me?.id) {
    const n = cleanNumber(auth.creds.me.id.split(':')[0].split('@')[0]);
    if (n) { session.number = n; session.ownerNumber = n; }
  }

  const s = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    auth: { creds: auth.creds, keys: makeCacheableSignalKeyStore(auth.keys, logger) },
    markOnlineOnConnect: !!config.ONLINE,
    syncFullHistory: false,
    emitOwnEvents: false,
    connectTimeoutMs: 30000,
    keepAliveIntervalMs: 20000,
    defaultQueryTimeoutMs: 30000,
    retryRequestDelayMs: 250,
    generateHighQualityLinkPreview: false,
    // SPEED: answer WhatsApp's group-metadata requests from cache so the socket
    // never blocks on a network round-trip while a command is running.
    cachedGroupMetadata,
    shouldIgnoreJid: (jid) => typeof jid === 'string' && (
      (jid === 'status@broadcast' && !config.AUTOSTATUS && !config.AUTOREAD_STATUS) || jid.endsWith('@newsletter')
    ),
    // Serve the ORIGINAL message bytes back to WhatsApp when it asks us to
    // re-deliver one (retry receipts / resends). Returning `undefined` here is
    // exactly what produced the "Waiting for this message. This may take a
    // while" placeholder: the recipient asked for a message we had, but we
    // replied "I don't have it", so their client kept waiting. We now answer
    // from the in-memory message store (anti-delete already keeps 800 of them).
    getMessage: async (key) => {
      try {
        if (!key?.id) return undefined;
        const stored = msgStore.get(key.id);
        return stored?.message || undefined;
      } catch { return undefined; }
    },
  });

  // Persist creds to disk AND mirror the whole session folder to MongoDB, so a
  // container restart (ephemeral disk) reconnects this number WITHOUT re-pairing.
  // scheduleMirror is debounced + fire-and-forget, so it never slows the socket.
  const persistCreds = async () => {
    try { await saveCreds(); } catch { /* ignore */ }
    sessionStore.scheduleMirror(session.number, dir);
  };
  s.ev.on('creds.update', persistCreds);
  // Seed the cloud copy shortly after connect (covers a fresh pairing + any
  // pre-keys / app-state keys Baileys wrote to disk while opening the socket).
  sessionStore.scheduleMirror(session.number, dir, 5000);
  s.ev.on('connection.update', (u) => onConnectionUpdate(session, s, u));
  s.ev.on('messages.upsert', (u) => onMessagesUpsert(session, s, u));
  s.ev.on('group-participants.update', (u) => onGroupUpdate(session, s, u));
  s.ev.on('group.join-request', (u) => onJoinRequest(session, s, u));
  s.ev.on('call', (u) => onCall(session, s, u));
  return s;
}

/** Start (or restart) one session's socket — idempotent */
async function startSession(session) {
  if (session.startPromise) return session.startPromise;
  session.startPromise = (async () => {
    try {
      if (session.sock) { try { session.sock.end(undefined); } catch { /* ignore */ } session.sock = null; }
      session.sock = await createSocket(session);
      const reg = session.sock.authState?.creds?.registered;
      if (session.status !== 'pairing') session.status = reg ? 'connecting' : 'unpaired';
      // IMPORTANT: do NOT call requestPairingCode() here.
      //
      // Baileys' requestPairingCode() sets AND persists creds.me = <number>@s.whatsapp.net
      // *before* it sends the node. If we call it before the WebSocket is open the
      // send throws "Connection Closed" but creds.me is already saved. The next time
      // the socket opens, Baileys' validateConnection() sees creds.me set and sends a
      // LOGIN handshake instead of a REGISTER one -> WhatsApp answers 401 (loggedOut)
      // and the link never completes ("code failed").
      //
      // The safe trigger is the `qr` event: it only fires AFTER Baileys has already
      // sent the registration node, so requesting the code there never corrupts the
      // handshake. See the `qr` branch in onConnectionUpdate().
    } catch (e) {
      session.status = 'error';
      session.lastError = e?.message || String(e);
      console.error(`[BOT:${session.number}] start fail:`, e?.message || e);
    } finally {
      session.startPromise = null;
    }
  })();
  return session.startPromise;
}

// Hard ceiling on reconnect churn.
// Without this, a number that WhatsApp keeps rejecting loops forever: every retry
// opens a NEW socket for the same number, and each new socket invalidates the
// pairing code the user is currently typing ("incorrect code"). A dead session
// must stay dead until the user explicitly asks for a fresh code.
const MAX_RECONNECT_ATTEMPTS = 4;

function scheduleReconnect(session, immediate = false) {
  if (session.restarting) return;
  if (session.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    session.status = 'unpaired';
    session.pairNumber = null;
    try { session.sock?.end(undefined); } catch { /* ignore */ }
    session.sock = null;
    debug.info('reconnect cap reached -- session parked', { number: session.number, attempts: session.reconnectAttempts });
    return;
  }
  session.restarting = true;
  session.reconnectAttempts += 1;
  const delay = immediate ? RESTART_DELAY_MS : Math.min(30000, 1500 * session.reconnectAttempts);
  setTimeout(() => { session.restarting = false; startSession(session).catch(() => {}); }, delay);
}

/**
 * Ask WhatsApp for an 8-char pairing code — exactly once per pairing attempt.
 *
 * Why this exists: the code used to be requested ONLY on the first `qr` event.
 * In pairing-code mode Baileys has to open a websocket and complete a handshake
 * before the server will answer, so the code arrived several seconds late — the
 * "pairing code arrives late" complaint. Requesting it as soon as the socket
 * exists (and keeping the QR path as a retry) removes that dead time.
 */
function requestCodeOnce(session, s) {
  if (!session.pairNumber || session.codeSent || s?.authState?.creds?.registered) return;
  session.codeSent = true;
  s.requestPairingCode(session.pairNumber)
    .then((code) => {
      session.code = code;
      session.number = session.pairNumber;
      session.status = 'pairing';
      session.pairingSince = Date.now();
      events.emit('code', { number: session.number, code });
      if (session.pairResolve) { const r = session.pairResolve; session.pairResolve = null; session.pairReject = null; r(code); }
    })
    .catch((err) => {
      // Transient failure (e.g. the socket wasn't quite open yet). Do NOT emit a
      // fatal 'error' here — that would close the portal's SSE stream and show
      // "code failed". Just allow a later `qr` event (or the pair timeout) to
      // retry / report cleanly.
      session.codeSent = false;
      session.lastError = err?.message || String(err);
      debug.info('pairing code request failed (will retry)', { number: session.number, error: session.lastError });
    });
}

function onConnectionUpdate(session, s, upd) {
  if (s !== session.sock) return; // stale socket guard

  // Any connection event = progress. Refresh the watchdog clock so we only
  // force-restart a session that has TRULY gone quiet (no updates at all).
  session.lastUpdate = Date.now();

  const { connection, lastDisconnect, qr, isNewLogin } = upd;
  debug.info('conn.update', { number: session.number, connection: connection || null, hasQr: !!qr, qrLen: qr ? String(qr).length : 0, isNewLogin: !!isNewLogin });

  if (isNewLogin) {
    session.status = 'pairing';
    session.lastError = null;
    events.emit('linking', { number: session.number });
    return;
  }

  // QR event (also fires in pairing-code mode). We ALWAYS forward the raw QR
  // string to the portal so the user can scan it with their phone as an
  // alternative to typing the 8-digit pairing code. Then (if a pairing code was
  // requested) we also fetch the code. If the code request already succeeded
  // earlier this is a no-op; if it failed, this is the retry.
  if (qr) {
    session.lastQr = qr;
    session.qrAt = Date.now();
    try { events.emit('qr', { number: session.pairNumber || session.number, qr }); } catch { /* ignore */ }
    if (session.pairNumber) requestCodeOnce(session, s);
    return;
  }

  if (connection === 'connecting') {
    const reg = s.authState?.creds?.registered;
    if (!reg && !session.pairNumber) {
      // No credentials and no pairing in progress -> nothing to connect with.
      // Stay 'unpaired' (waiting for a link) instead of looping forever in
      // 'connecting' (which the watchdog would keep restarting).
      session.status = 'unpaired';
      return;
    }
    if (session.status !== 'pairing') session.status = 'connecting';
    debug.info('connecting', { number: session.number });
    return;
  }

  if (connection === 'open') {
    session.everOpened = true;
    session.status = 'connected';
    session.since = Date.now();
    session.code = null;
    session.lastQr = null;
    session.qrAt = 0;
    session.lastError = null;
    session.reconnectAttempts = 0;
    session.restarts = 0;
    session.restarting = false;
    session.pairNumber = null;
    session.codeSent = false;
    session.pairingSince = 0;
    const me = s.user?.id?.split(':')[0]?.split('@')[0];
    if (me) { session.number = cleanNumber(me); session.ownerNumber = cleanNumber(me); }
    session.me = s.user?.id || null;

    // First linked number becomes the global owner if none is set.
    if (!config.OWNER_NUMBER) {
      config.OWNER_NUMBER = session.ownerNumber;
      try { require('./settings').save(); } catch { /* ignore */ }
    }

    console.log(`✅ ${config.BOT_NAME} session connected as ${session.number} (owner: ${session.ownerNumber})`);
    events.emit('paired', { number: session.number });
    debug.info('connected', { number: session.number, me: session.me });
    // Unsolicited greeting is OFF by default (no unwanted automatic messages).
    // Enable with AUTOGREET=true if you explicitly want a "bot online" ping.
    if (config.AUTOGREET) {
      s.sendMessage(`${session.number}@s.whatsapp.net`, {
        text: `🤖 *${config.BOT_NAME}* online hy!\nType *${config.PREFIX}menu* for all commands.`,
      }).catch(() => {});
    }
    if (config.AUTOBIO) {
      s.updateProfileStatus(`${config.BOT_NAME} | ${config.OWNER_NAME}`).catch(() => {});
    }
    return;
  }

  if (connection === 'close') {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const registered = s.authState?.creds?.registered;
    const pairingInProgress = !!session.pairNumber && !session.everOpened;
    const loggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
    debug.info('connection close', { number: session.number, statusCode, everOpened: session.everOpened, registered, pairingInProgress, loggedOut });

    // A 401 while a pairing attempt is in flight is NOT a real logout: it means
    // WhatsApp rejected a half-built registration (Baileys had persisted creds.me,
    // so the socket sent a "login" instead of a "register" handshake). Wipe the
    // bad creds and retry the registration (bounded) so the user still gets a
    // working code instead of an endless 401 loop.
    if (loggedOut && pairingInProgress) {
      session.restarts += 1;
      if (session.restarts > MAX_RESTARTS) {
        session.status = 'error';
        session.lastError = 'Link complete nahi hua. Wajah: code expire ho gaya, number galat hai, ya WhatsApp ne is number par temporary limit laga di hai. 2 minute ruk kar dobara try karein.';
        events.emit('error', { number: session.number, error: session.lastError });
        failPair(session, new Error(session.lastError));
        resetSessionDir(session.number);
        session.sock = null;
        session.codeSent = false;
        session.pairNumber = null;
        return;
      }
      console.log(`🔁 [${session.number}] 401 during pairing — resetting creds + retrying (${session.restarts}/${MAX_RESTARTS})`);
      resetSessionDir(session.number);
      session.codeSent = false;
      session.restarting = true;
      try { s.end(undefined); } catch { /* ignore */ }
      // Back off progressively. Hammering WhatsApp with a new socket every 200ms
      // gets the number rate-limited, and a rate-limited number answers every
      // pairing code with "could not link device".
      const backoff = Math.min(8000, 1200 * session.restarts);
      setTimeout(() => { session.restarting = false; startSession(session).catch(() => {}); }, backoff);
      return;
    }

    if (loggedOut) {
      // Genuine logout (session was actually linked before, or no pairing in
      // progress). Clean it up and leave it 'unpaired' — the user must re-link.
      console.log(`⚠️ [${session.number}] logged out / 401 — session reset`);
      resetSessionDir(session.number);
      session.sock = null;
      session.codeSent = false;
      session.everOpened = false;
      session.status = 'unpaired';
      session.me = null;
      session.code = null;
      session.lastError = null;
      session.pairNumber = null;
      return;
    }

    if (!session.everOpened && (session.codeSent || registered)) {
      if (session.restarting) return;
      session.restarts += 1;
      if (session.restarts > MAX_RESTARTS) {
        session.status = 'error';
        session.lastError = 'Link complete nahi hua. Wajah: code expire ho gaya, number galat hai, ya WhatsApp ne is number par temporary limit laga di hai. 2 minute ruk kar dobara try karein.';
        events.emit('error', { number: session.number, error: session.lastError });
        failPair(session, new Error('Link complete nahi hua. Wajah: code expire ho gaya, number galat hai, ya WhatsApp ne is number par temporary limit laga di hai. 2 minute ruk kar dobara try karein.'));
        resetSessionDir(session.number);
        session.codeSent = false;
        scheduleReconnect(session, false);
        return;
      }
      console.log(`🔁 [${session.number}] restartRequired (${statusCode}) — reconnect ${session.restarts}/${MAX_RESTARTS}`);
      session.restarting = true;
      try { s.end(undefined); } catch { /* ignore */ }
      setTimeout(() => { session.restarting = false; startSession(session).catch(() => {}); }, RESTART_DELAY_MS);
      return;
    }

    // Fazool-data guard: this session never linked and has no pairing in
    // progress — don't loop reconnects on it, drop it and its data entirely.
    const registeredNow = s.authState?.creds?.registered;
    if (!session.everOpened && !session.codeSent && !registeredNow) {
      console.log(`[BOT:${session.number}] pairing never completed — removing junk session data`);
      try { session.sock?.end?.(undefined); } catch { /* ignore */ }
      resetSessionDir(session.number);
      sessions.delete(session.number);
      return;
    }

    session.status = 'connecting';
    console.log(`🔄 [${session.number}] reconnecting... (${statusCode})`);
    scheduleReconnect(session, false);
  }
}

async function onMessagesUpsert(session, s, { messages, type }) {
  // Accept both 'notify' (new message) and 'append' (history/offline sync) so
  // we never silently drop an incoming command.
  if (type !== 'notify' && type !== 'append') return;
  for (const m of messages) {
    const jid = m.key?.remoteJid || '';
    // Status posts arrive with remoteJid = 'status@broadcast'. They must reach
    // handleMessage so the auto-status hook can view/react to them — the old
    // code `continue`d past them unless AUTOSTATUS was already ON, which meant
    // the feature could never actually start working.
    const isStatus = jid === 'status@broadcast';
    if (isStatus) {
      // Deliver a status to the hook when ANY status feature is on:
      //   .autostatus / .autoreadstatus  -> AUTOSTATUS / AUTOREAD_STATUS
      //   .statusview                    -> STATUSVIEW
      //   .statuslike                    -> STATUSLIKE
      // Previously only AUTOSTATUS/AUTOREAD_STATUS were checked, so `.statusview`
      // and `.statuslike` turned ON but the status never reached the handler —
      // which is exactly why they "did nothing".
      // Auto-react (PER BOT) also likes statuses, so deliver the status when THIS
      // session's own auto-react is on too.
      let rsAuto = false;
      try { rsAuto = reactSettings.get(session?.number).autoReact; } catch { /* ignore */ }
      if (!config.AUTOSTATUS && !config.AUTOREAD_STATUS && !config.STATUSVIEW && !config.STATUSLIKE && !rsAuto) continue;
      // Skip our own status posts so we don't view/react to ourselves.
      if (m.key?.fromMe) continue;
    } else if (jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) {
      continue;
    }
    debug.info('upsert', { type, jid, fromMe: !!m.key?.fromMe, id: m.key?.id });
    handleMessage(s, m, session).catch((e) => {
      console.error('[MSG]', e?.message || e);
      debug.error('handleMessage threw', { error: e?.message || String(e) });
    });
  }
}

async function onGroupUpdate(session, s, upd) {
  if (!config.WELCOME && !config.GOODBYE) return;
  try {
    const meta = await s.groupMetadata(upd.id);
    const name = meta.subject;
    for (const jid of upd.participants) {
      const num = cleanNumber(jid.split('@')[0]);
      const fill = (tpl) => String(tpl)
        .replace(/@user/gi, `@${num}`)
        .replace(/@group/gi, name)
        .replace(/@name/gi, name);
      if (upd.action === 'add' && config.WELCOME) {
        const text = fill(config.WELCOME_MSG || `👋 Welcome @user to @group!\n\nType ${config.PREFIX}menu to see what I can do 🔥`);
        await s.sendMessage(upd.id, { text, mentions: [jid] }).catch(() => {});
      }
      if (upd.action === 'remove' && config.GOODBYE) {
        const text = fill(config.GOODBYE_MSG || `🕊️ *+@user* left @group. Allah Hafiz!`);
        await s.sendMessage(upd.id, { text, mentions: [jid] }).catch(() => {});
      }
    }
  } catch { /* ignore */ }
}

/** Auto-approve join requests for groups that enabled `.autoapprove`. */
async function onJoinRequest(session, s, upd) {
  try {
    if (upd?.action && upd.action !== 'created') return; // only fresh requests
    const group2 = require('../plugins/group2');
    if (!group2.isAutoApprove || !group2.isAutoApprove(upd.id)) return;
    const jid = upd.participantPn || upd.participant || upd.author;
    if (jid) await s.groupRequestParticipantsUpdate(upd.id, [jid], 'approve').catch(() => {});
  } catch { /* ignore */ }
}

async function onCall(session, s, calls) {
  if (!config.ANTICALL) return;
  try {
    for (const c of calls || []) {
      if (c.status !== 'offer') continue;
      await s.rejectCall(c.id, c.from).catch(() => {});
      // She does NOT want the bot announcing itself on every call. The notice
      // only goes out if she has explicitly set a custom message; by default
      // the call is just rejected silently.
      const msg = String(config.ANTICALL_MSG || '').trim();
      if (msg) await s.sendMessage(c.from, { text: msg }).catch(() => {});
    }
  } catch { /* ignore */ }
}

/** Request an 8-char pairing code for a phone number (creates a session) */
async function requestPair(rawNumber) {
  // Normalise FIRST. A local number like "03001234567" must become
  // "923001234567" before WhatsApp is asked for a code -- otherwise the code is
  // issued for a number that does not exist and the user gets
  // "could not link device" when they type it.
  const norm = normalizePhone(rawNumber, config.DEFAULT_COUNTRY_CODE || '92');
  const number = norm.number;
  const check = validatePhone(number);
  if (!check.ok) throw new Error(check.error);
  if (norm.changed) {
    debug.info('number normalised', { from: norm.original, to: number });
  }

  let session = sessions.get(number);
  if (session && session.status === 'connected') throw new Error('Ye number already linked hai ✅');

  // IDEMPOTENCY GUARD.
  // requestPair() wipes the session (code=null, codeSent=false, session dir reset)
  // before asking WhatsApp for a new code. Calling it twice for the same number
  // therefore KILLS the first code and issues a second one -- the user then types
  // the code they were shown and WhatsApp answers "incorrect code".
  // So: if we already hold a fresh code for this exact number, hand it back.
  const CODE_TTL_MS = 85000; // WhatsApp codes last ~2 min; reuse well inside that window
  if (
    session &&
    session.code &&
    session.status === 'pairing' &&
    session.pairNumber === number &&
    session.pairingSince &&
    Date.now() - session.pairingSince < CODE_TTL_MS
  ) {
    return session.code;
  }

  if (!session) {
    if (sessions.size >= config.MAX_SESSIONS) {
      throw new Error(`Max ${config.MAX_SESSIONS} sessions allowed. Koi purana session hatao.`);
    }
    session = newSession(number);
    sessions.set(number, session);
  }

  // supersede any pending pairing request for this session
  if (session.pairReject) {
    const r = session.pairReject;
    session.pairResolve = null;
    session.pairReject = null;
    r(new Error('Superseded by a new pairing request.'));
  }

  session.codeSent = false;
  session.restarts = 0;
  session.everOpened = false;
  session.code = null;
  session.lastError = null;
  session.pairNumber = number;

  // Always start a fresh pairing from a CLEAN slate. A leftover creds.me (from an
  // earlier half-finished attempt) makes Baileys send a "login" handshake instead
  // of "register", which WhatsApp rejects with 401 -> the exact "code failed" loop.
  if (session.sock) { try { session.sock.end(undefined); } catch { /* ignore */ } session.sock = null; }
  resetSessionDir(number);
  await startSession(session);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pairResolve = null;
      session.pairReject = null;
      // Pairing expired -> drop the empty socket so it doesn't loop as a
      // forever-"connecting" zombie.
      try { session.sock?.end(undefined); } catch { /* ignore */ }
      session.sock = null;
      session.pairNumber = null;
      session.status = 'unpaired';
      reject(new Error('Pairing code nahi bana (timeout). Dobara try karo.'));
    }, 45000);
    session.pairResolve = (code) => { clearTimeout(timer); resolve(code); };
    session.pairReject = (err) => { clearTimeout(timer); reject(err); };
  });
}

/** Remove a session (logout + delete creds) */
async function removeSession(number) {
  const n = cleanNumber(number);
  const session = sessions.get(n);
  if (!session) return false;
  try { await session.sock?.logout(); } catch { /* ignore */ }
  try { session.sock?.end(undefined); } catch { /* ignore */ }
  resetSessionDir(n);
  // Drop the cloud copy too, so the unlinked number is NOT restored on restart.
  try { await sessionStore.deleteSession(n); } catch { /* ignore */ }
  sessions.delete(n);
  return true;
}

/**
 * Migrate a legacy single-session layout (creds.json sitting directly inside
 * SESSION_DIR) into the multi-session layout (SESSION_DIR/<number>/creds.json).
 * This lets a number that was paired with an older build keep its WhatsApp
 * link after upgrading to the multi-session code.
 */
function migrateLegacySession() {
  const base = path.resolve(config.SESSION_DIR);
  const credsPath = path.join(base, 'creds.json');
  try {
    if (!fs.existsSync(credsPath)) return;
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    let number = '';
    try {
      const raw = creds?.me?.id || creds?.me || '';
      number = cleanNumber(String(raw).split(':')[0].split('@')[0]);
    } catch { /* ignore */ }
    if (!/^[0-9]{8,15}$/.test(number)) {
      console.log('[BOT] legacy session found but its number could not be read — skipping migration');
      return;
    }
    const dest = sessionDir(number);
    if (fs.existsSync(path.join(dest, 'creds.json'))) {
      console.log(`[BOT] legacy session for ${number} already migrated`);
      return;
    }
    fs.mkdirSync(dest, { recursive: true });
    let moved = 0;
    for (const f of fs.readdirSync(base)) {
      if (!f.endsWith('.json')) continue; // only auth-state files
      const src = path.join(base, f);
      try {
        if (fs.statSync(src).isFile()) { fs.renameSync(src, path.join(dest, f)); moved += 1; }
      } catch { /* ignore */ }
    }
    console.log(`[BOT] migrated legacy session -> ${number} (${moved} file(s))`);
  } catch (e) {
    console.log(`[BOT] legacy session migration failed: ${e?.message || e}`);
  }
}

/** Restore every session folder found on disk (survives redeploys) */
async function restoreSessions() {
  // Ephemeral-disk hosts (many free tiers): rebuild the session folder
  // from the SESSION_ID env var BEFORE scanning disk, so logins survive restarts.
  try { restoreFromSessionId(); } catch (e) { console.log('[SESSION_ID] restore error:', e?.message || e); }
  migrateLegacySession();
  // DATABASE PERSISTENCE: rebuild any session folders the ephemeral disk lost
  // from their MongoDB copies, so every linked number reconnects automatically
  // (no re-pairing). Runs before the disk scan; never clobbers a live session.
  try { await sessionStore.restoreAll(path.resolve(config.SESSION_DIR)); }
  catch (e) { console.log('[SESSION-STORE] restore error:', e?.message || e); }
  const base = path.resolve(config.SESSION_DIR);
  let dirs = [];
  try { dirs = fs.readdirSync(base).filter((d) => fs.statSync(path.join(base, d)).isDirectory()); } catch { return; }
  for (const d of dirs) {
    if (!/^[0-9]{8,15}$/.test(d)) continue; // only numeric session folders
    // Fazool-data guard: only restore sessions that actually completed pairing.
    // A folder without registered creds is a dead pairing attempt — delete it
    // instead of restoring it as a forever-"connecting" zombie session.
    // - No creds.json at all -> never paired, safe to delete (pure junk).
    // - creds.json but not registered -> KEEP the data (may be recoverable),
    //   just don't auto-restore it as a forever-"connecting" zombie.
    let creds = null;
    try { creds = JSON.parse(fs.readFileSync(path.join(base, d, 'creds.json'), 'utf8')); } catch { creds = null; }
    if (!creds) {
      fs.rmSync(path.join(base, d), { recursive: true, force: true });
      console.log(`[BOT] removed empty junk session dir: ${d}`);
      continue;
    }
    if (!creds.registered || !creds.me?.id) {
      console.log(`[BOT] skipping unregistered session dir (data kept): ${d}`);
      continue;
    }
    if (sessions.has(d)) continue;
    if (sessions.size >= config.MAX_SESSIONS) break;
    const session = newSession(d);
    sessions.set(d, session);
    startSession(session).catch(() => {});
  }
  if (dirs.length) console.log(`[BOT] restoring ${sessions.size} session(s) from disk`);
}

async function startBot() {
  await restoreSessions();
  startWatchdog();
  startSessionMirror();
}

// ---- periodic session mirror (safety net) --------------------------------
// creds.update covers most writes, but app-state / pre-key files change during
// message decryption WITHOUT an event. Mirror every active session folder to
// MongoDB every 60s so a restart never loses them (no re-pairing).
function startSessionMirror() {
  if (startSessionMirror._t) return;
  startSessionMirror._t = setInterval(() => {
    try {
      const entries = [...sessions.values()].map((s) => ({ number: s.number, dir: sessionDir(s.number) }));
      if (entries.length) sessionStore.mirrorAll(entries).catch(() => {});
    } catch { /* ignore */ }
  }, 60 * 1000);
  if (startSessionMirror._t.unref) startSessionMirror._t.unref();
  debug.info('session mirror started', { everyMs: 60 * 1000 });
}

// ---- connection watchdog (self-healing) --------------------------------
// A session can get stuck in 'connecting' forever (network blip, stale
// handshake, WhatsApp hiccup). The watchdog force-restarts any session that
// hasn't made progress for STUCK_MS, and if NO session is connected at all
// for GLOBAL_STUCK_MS it restarts every session. This is what stops the bot
// from silently going dark — the exact failure the user hit.
const STUCK_MS = 90 * 1000;            // a single session stuck this long -> restart
const GLOBAL_STUCK_MS = 2 * 60 * 1000; // everything dark this long -> restart all
const MAX_WATCHDOG_RESTARTS = 6;       // then surface a clear "re-link" message
// A pairing attempt that never completes (user closed the tab, code expired)
// would otherwise sit in 'pairing' forever holding a socket. Drop it after 3
// minutes. (This constant was referenced but never defined — the ReferenceError
// it threw aborted the whole watchdog tick, so self-healing silently stopped
// working whenever any session was mid-pairing.)
const PAIRING_TIMEOUT_MS = 3 * 60 * 1000;
let globalDarkSince = 0;

function forceRestart(session, reason) {
  if (session.status === 'pairing') return; // never interrupt an active pairing
  session.watchdogRestarts = (session.watchdogRestarts || 0) + 1;
  debug.info('watchdog restart', { number: session.number, reason, attempt: session.watchdogRestarts });
  console.log(`\ud83e\ude7a [${session.number}] watchdog restart (${reason}) attempt ${session.watchdogRestarts}`);
  try { session.sock?.end(undefined); } catch { /* ignore */ }
  session.sock = null;
  session.restarting = false;
  session.reconnectAttempts = 0;
  session.lastUpdate = Date.now();
  if (session.watchdogRestarts > MAX_WATCHDOG_RESTARTS) {
    session.status = 'error';
    session.lastError = 'Connection stuck \u2014 is number ko dobara link karo (re-link).';
    debug.error('watchdog gave up', { number: session.number });
    return;
  }
  startSession(session).catch(() => {});
}

function watchdogTick() {
  const now = Date.now();
  let anyConnected = false;
  for (const session of sessions.values()) {
    if (session.status === 'connected') { anyConnected = true; continue; }
    if (session.status === 'unpaired') continue;
    // Abandoned pairing -> drop the forever-"pairing" zombie so it stops
    // holding a socket / showing up in the session list.
    if (session.status === 'pairing') {
      const pairingIdle = now - (session.pairingSince || session.lastUpdate || now);
      if (pairingIdle > PAIRING_TIMEOUT_MS) {
        console.log(`🧹 [${session.number}] pairing timed out (${Math.round(pairingIdle / 1000)}s) — dropping zombie session`);
        try { session.sock?.end?.(undefined); } catch { /* ignore */ }
        session.sock = null;
        session.code = null;
        session.pairNumber = null;
        session.codeSent = false;
        session.pairingSince = 0;
        if (!session.everOpened) {
          sessions.delete(session.number);
        } else {
          session.status = 'connecting';
          session.lastUpdate = now;
        }
      }
      continue;
    }
    const idle = now - (session.lastUpdate || session.startedAt || now);
    if (idle > STUCK_MS) forceRestart(session, `stuck ${Math.round(idle / 1000)}s`);
  }
  if (sessions.size > 0 && !anyConnected) {
    if (!globalDarkSince) globalDarkSince = now;
    else if (now - globalDarkSince > GLOBAL_STUCK_MS) {
      globalDarkSince = now;
      debug.info('watchdog: all sessions dark \u2014 forcing reconnect');
      for (const session of sessions.values()) forceRestart(session, 'all-dark');
    }
  } else {
    globalDarkSince = 0;
  }
}

function startWatchdog() {
  if (startWatchdog._t) return;
  startWatchdog._t = setInterval(() => { try { watchdogTick(); } catch { /* ignore */ } }, 30 * 1000);
  if (startWatchdog._t.unref) startWatchdog._t.unref();
  debug.info('watchdog started', { stuckMs: STUCK_MS, globalStuckMs: GLOBAL_STUCK_MS });
}

/** Force-reconnect every session (used by POST /api/reconnect) */
async function reconnectAll() {
  let n = 0;
  for (const session of sessions.values()) {
    if (session.status === 'pairing') continue;
    forceRestart(session, 'manual');
    n += 1;
  }
  return n;
}

function getSock() {
  for (const s of sessions.values()) if (s.status === 'connected' && s.sock) return s.sock;
  for (const s of sessions.values()) if (s.sock) return s.sock;
  return null;
}

function listSessions() {
  return [...sessions.values()].map((s) => ({
    number: s.number, status: s.status, since: s.since, me: s.me, owner: s.ownerNumber,
  }));
}

function getStatus() {
  const list = [...sessions.values()];
  const connected = list.filter((s) => s.status === 'connected');
  const primary = connected[0] || list[0] || null;
  return {
    status: primary ? primary.status : 'idle',
    connected: connected.length > 0,
    number: primary ? primary.number : null,
    code: primary ? primary.code : null,
    me: primary ? primary.me : null,
    lastError: primary ? primary.lastError : null,
    since: primary ? primary.since : null,
    uptime: formatDuration(Date.now() - startedAt),
    botName: config.BOT_NAME,
    owner: config.OWNER_NAME,
    sessionCount: list.length,
    connectedCount: connected.length,
    maxSessions: config.MAX_SESSIONS,
    sessions: listSessions(),
  };
}

module.exports = { startBot, requestPair, removeSession, getStatus, getSock, listSessions, reconnectAll, events, sessions };
