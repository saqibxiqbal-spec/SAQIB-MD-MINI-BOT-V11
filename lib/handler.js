/**
 * SAQIB MD — message handler & command dispatcher
 * -----------------------------------------------
 * - anti-delete works in GROUPS **and** INBOX (DMs)
 * - MODE=private → only the owner (linked number) + sudo users can run commands
 * - MODE=public  → everyone can run commands
 * - commands flagged `ownerOnly` are restricted to the owner in every mode
 * - the owner is always recognised (fromMe + LID resolution), so private mode
 *   can never lock the owner out of their own bot.
 */
const config = require('../config');
const registry = require('../plugins/_registry');
const selfheal = require('./selfheal');
const { cleanNumber } = require('./helpers');
const { msgStore } = require('./cache');
const bans = require('./bans');
const debug = require('./debug');
const contacts = require('./contacts');
const prefixes = require('./prefixes');
const interactions = require('./interactions');
const lang = require('./lang');

/** Levenshtein distance (for typo auto-correct). */
function levenshtein(a, b) {
  a = String(a); b = String(b);
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Closest command name to `input` (and its edit distance).
 *
 * SPEED: two prunes make this O(few) instead of O(1837):
 *   1. only names whose length is within `maxD` of the input can be within
 *      `maxD` edits, so everything else is skipped without any Levenshtein work;
 *   2. an exact match (distance 0) short-circuits immediately.
 * The candidate list itself is built once (see allCommandNames) and bucketed by
 * length, so we never even iterate the full list.
 */
function closestCommand(input, maxD) {
  const li = input.length;
  const lo = Math.max(1, li - maxD), hi = li + maxD;
  let best = null, bestD = maxD + 1;

  // FAST PASS — real typos almost always keep the first character, so scan that
  // small bucket first (still length-filtered).
  const first = _byFirst.get(input[0]);
  if (first) {
    for (const c of first) {
      if (c.length < lo || c.length > hi) continue;
      const d = levenshtein(input, c);
      if (d < bestD) { bestD = d; best = c; if (d === 0) return { cmd: best, dist: 0 }; }
    }
    if (best) return { cmd: best, dist: bestD };
  }

  // SLOW PASS — fallback for typos that also changed the first character.
  for (let L = lo; L <= hi; L++) {
    const bucket = _byLen.get(L);
    if (!bucket) continue;
    for (const c of bucket) {
      const d = levenshtein(input, c);
      if (d < bestD) { bestD = d; best = c; if (d === 0) return { cmd: best, dist: 0 }; }
    }
  }
  return { cmd: best, dist: bestD };
}

/**
 * Every registered command name, bucketed by length (built once).
 * SPEED: plugins load a single time at boot, so this index is immutable and
 * never needs rebuilding — the old code re-allocated a 1800-element array on
 * every unknown command.
 */
let _cmdNames = null;
let _byLen = null;
let _byFirst = null;
function allCommandNames() {
  if (_cmdNames) return _cmdNames;
  const out = [];
  const byLen = new Map();
  const byFirst = new Map();
  for (const p of registry.all()) {
    for (const c of p.commands) {
      out.push(c);
      const L = c.length;
      if (!byLen.has(L)) byLen.set(L, []);
      byLen.get(L).push(c);
      const f = c[0];
      if (!byFirst.has(f)) byFirst.set(f, []);
      byFirst.get(f).push(c);
    }
  }
  _cmdNames = out;
  _byLen = byLen;
  _byFirst = byFirst;
  return out;
}

/**
 * Drop the memoised command/typo index so the next message rebuilds it from the
 * (possibly freshly reloaded) registry. Used by the REAL `.update` / `.refresh`
 * system refresh (lib/system.js) after plugins are re-read from disk.
 */
function resetCommandIndex() {
  _cmdNames = null;
  _byLen = null;
  _byFirst = null;
}

/** Extract plain text from a Baileys message */
function getText(m) {
  return (
    m.message?.conversation ||
    m.message?.extendedTextMessage?.text ||
    m.message?.imageMessage?.caption ||
    m.message?.videoMessage?.caption ||
    m.message?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    ''
  );
}

/** Resolve the quoted (replied-to) message */
function getQuoted(m) {
  const ctx = m.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.quotedMessage) return null;
  return {
    // Resolve the replied-to participant's LID to their real phone number so
    // mentions never show a fake-looking `+<lid>`.
    key: { remoteJid: m.key.remoteJid, id: ctx.stanzaId, participant: contacts.resolve(ctx.participant) },
    message: ctx.quotedMessage,
  };
}

/** Resolve a sender JID to the real phone JID, mapping WhatsApp LIDs when possible. */
function resolveSender(jid, m) {
  let j = String(jid || '');
  if (j.endsWith('@lid')) {
    const pn = m?.key?.senderPn || m?.key?.participantPn || null;
    if (pn && !String(pn).endsWith('@lid')) j = pn;
    else j = contacts.resolve(j);
  }
  return j;
}

/** Is the sender the owner (global owner, this session's owner, or a sudo user)? */
function isOwner(senderJid, session, m) {
  // The bot runs as a LINKED DEVICE of the owner's own WhatsApp — anything the
  // owner types from that phone arrives with fromMe=true and (often) a LID
  // sender JID. It is always the owner speaking.
  if (m?.key?.fromMe) return true;
  const num = cleanNumber((resolveSender(senderJid, m) || '').split('@')[0].split(':')[0]);
  if (!num) return false;
  if (num === config.OWNER_NUMBER) return true;
  if (session && num === session.ownerNumber) return true;
  if (config.SUDO.includes(num)) return true;
  return false;
}

/** Build the command context object passed to plugins */
function buildContext(sock, m, session) {
  const from = m.key.remoteJid;
  const isGroup = from.endsWith('@g.us');
  const sender = isGroup ? resolveSender(m.key.participant || from, m) : resolveSender(from, m);
  const pushname = m.pushName || 'User';
  const text = getText(m).trim();
  const senderNum0 = cleanNumber(sender.split('@')[0].split(':')[0]);

  // PER-USER PREFIX: each user parses commands with their OWN prefix. If they
  // haven't set one, the global default applies. Nobody's prefix can affect
  // anybody else's.
  const prefix = prefixes.forUser(senderNum0);

  // GROUP-FRIENDLY PARSING ------------------------------------------------
  // The default prefix is an emoji, which is painful to type on a phone inside
  // a group. In groups we therefore also accept:
  //   1. the user's normal prefix                      (unchanged)
  //   2. an @-mention of the bot followed by a command ("@Bot ping")
  //   3. a bare command name that the registry actually knows ("ping")
  // DM behaviour is untouched — only groups get the lenient parsing, so nobody
  // can accidentally trigger commands in a private chat.
  const isGroupChat = from.endsWith('@g.us');

  let command = null;
  let args = [];
  let body = text;
  let hadPrefix = false;

  // (1) normal prefix
  if (body.startsWith(prefix)) {
    body = body.slice(prefix.length).trim();
    hadPrefix = true;
  } else if (isGroupChat) {
    // (2) bot mentioned at the start of the message
    const me = sock?.user;
    const myId = me?.id || '';
    const myLid = me?.lid || '';
    const mentionRe = /^@\S+\s*/;
    const mentioned = Array.isArray(m.message?.extendedTextMessage?.contextInfo?.mentionedJid)
      ? m.message.extendedTextMessage.contextInfo.mentionedJid : [];
    const mentionsMe = mentioned.some((j) => j === myId || j === myLid || (myId && j.split('@')[0] === myId.split('@')[0]))
      || (myId && body.includes('@' + myId.split('@')[0]));
    if (mentionsMe) body = body.replace(mentionRe, '').trim();
    // (3) bare known command
    if (!mentionsMe) {
      const first = body.split(/\s+/)[0].toLowerCase();
      if (!registry.find(first)) body = '';   // not a command -> leave body empty
    }
  }

  if (body) {
    const parts = body.trim().split(/\s+/);
    const cmd = (parts.shift() || '').toLowerCase();
    // Only treat it as a command if the registry knows it (or it is one of the
    // informational words). This stops ordinary group chatter from being
    // interpreted as a command.
    // Lenient parsing is GROUP-ONLY: in a DM a command must carry the prefix,
    // so ordinary chat can never be mistaken for a command.
    if (cmd && (hadPrefix || isGroupChat)) {
      command = cmd;
      args = parts;
    }
  }

  const quoted = getQuoted(m);
  const senderNum = senderNum0;

  // LANGUAGE: the reply language is looked up LAZILY (on every reply) so that
  // the instant `.botlanguage sd` runs, that very confirmation — and everything
  // after it — comes back in Sindhi, instead of the old language.
  const langFor = () => { try { return lang.forUser(senderNum0); } catch { return 'en'; } };
  const tr = async (txt) => {
    const code = langFor();
    if (!code || code === 'en') return String(txt);
    try { return await lang.translate(String(txt), code); } catch { return String(txt); }
  };

  const ctx = {
    sock, m, from, isGroup, sender, senderNum, pushname, session,
    text, command, args,
    arg: args.join(' '),
    quoted,
    prefix,
    isOwner: isOwner(sender, session, m),
    reply: async (txt, extra = {}) => sock.sendMessage(from, { text: await tr(txt), ...extra }, { quoted: m }),
    sendSticker: (buffer, isAnimated = false) => sock.sendMessage(from, { sticker: buffer, isAnimated }, { quoted: m }),
    send: async (jid, content, opts = {}) => {
      let c = content;
      try {
        const code = langFor();
        if (code && code !== 'en' && c && typeof c === 'object') {
          if (typeof c.text === 'string') c = { ...c, text: await lang.translate(c.text, code) };
          if (typeof c.caption === 'string') c = { ...c, caption: await lang.translate(c.caption, code) };
        }
      } catch { /* send untranslated */ }
      return sock.sendMessage(jid, c, opts);
    },
    react: (emoji, key = m.key) => sock.sendMessage(from, { react: { text: emoji, key } }),
  };
  return ctx;
}

/** Main entry: called for every incoming message */
/**
 * SPEED: group metadata is a network round-trip to WhatsApp on every call, so
 * caching it removes 300-800ms from every group command. A 3-minute TTL keeps
 * it correct (membership/admin changes are rare) while cutting round-trips.
 */
const _groupMetaCache = new Map(); // jid -> { at, meta }
const _groupMetaInflight = new Map(); // jid -> Promise<meta> (dedupes concurrent calls)
const GROUP_META_TTL = 3 * 60 * 1000;
async function getGroupMeta(sock, jid) {
  const hit = _groupMetaCache.get(jid);
  if (hit && Date.now() - hit.at < GROUP_META_TTL) return hit.meta;
  // Dedupe concurrent fetches: the background warm-up at the top of
  // handleMessage and the admin check below used to fire TWO network calls.
  if (_groupMetaInflight.has(jid)) return _groupMetaInflight.get(jid);
  const p = (async () => {
    try {
      const meta = await sock.groupMetadata(jid);
      _groupMetaCache.set(jid, { at: Date.now(), meta });
      if (_groupMetaCache.size > 200) {
        for (const [k, v] of _groupMetaCache) if (Date.now() - v.at > GROUP_META_TTL) _groupMetaCache.delete(k);
      }
      return meta;
    } finally { _groupMetaInflight.delete(jid); }
  })();
  _groupMetaInflight.set(jid, p);
  return p;
}

/** Bare phone number from any JID shape (@s.whatsapp.net, @lid, :device). */
function jidToNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

/**
 * Is a participant a group admin? LID-AWARE.
 * WhatsApp now hands out LIDs (@lid) for group participants, while the sender
 * JID we resolve is usually the real phone number (@s.whatsapp.net) — comparing
 * `participant.id === sender` therefore failed for EVERYONE, which is why admin
 * commands answered "sirf group admins ke liye hai" even for the real admins.
 * We now match by the bare number across id / phoneNumber / lid / jid.
 */
async function isGroupAdmin(sock, jid, participant) {
  const meta = await getGroupMeta(sock, jid);
  const target = jidToNumber(participant);
  if (!target) return false;
  const p = (meta.participants || []).find((x) => {
    const ids = [x.id, x.phoneNumber, x.lid, x.jid, x.pn].filter(Boolean);
    return ids.some((id) => jidToNumber(id) === target);
  });
  return !!(p && (p.admin === 'admin' || p.admin === 'superadmin'));
}

async function handleMessage(sock, m, session = null) {
  if (!m.message) return;
  // SPEED: warm the group-metadata cache in the BACKGROUND the moment a group
  // message arrives. Admin checks later in the same message then hit the cache
  // instead of paying a 300-800ms network round-trip.
  try {
    const jid = m.key?.remoteJid || '';
    if (jid.endsWith('@g.us') && !_groupMetaCache.has(jid)) {
      getGroupMeta(sock, jid).catch(() => {});
    }
  } catch { /* ignore */ }
  // ignore the bot's own outgoing echoes
  if (m.key.id && m.key.id.startsWith('BAE5') && m.key.id.length === 16) return;

  // Learn LID -> real phone-number mappings from every message we see.
  contacts.learnFromMessage(m);

  const from = m.key.remoteJid || '';
  const isGroup = from.endsWith('@g.us');
  const isStatus = from === 'status@broadcast';

  // ---- store recent messages (powers anti-delete) ----
  if (!isStatus && m.key.id) msgStore.set(m.key.id, m);

  if (config.AUTO_READ && !isStatus) sock.readMessages([m.key]).catch(() => {}); // fire-and-forget

  // ---- anti-delete: detect a revoke and resend the original ----
  // Works in GROUPS *and* INBOX. `ANTIDELETE` is the master switch.
  const proto = m.message?.protocolMessage;
  const isEdit = proto && proto.type === 'MESSAGE_EDIT';
  const isRevoke = proto && (proto.type === 0 || proto.type === 'REVOKE' || isEdit);
  // Groups use the master switch; inbox works if EITHER the master switch OR the
  // inbox-specific toggle is on.
  const antiOn = isGroup ? config.ANTIDELETE : (config.ANTIDELETE || config.ANTIDELETE_INBOX);
  // An EDIT is a separate feature with its own switch (`.antiedit on|off`) —
  // otherwise `.antidelete off` would silently kill edit-catching too, and there
  // was no way to catch edits without also catching deletes.
  if (isEdit && !config.ANTIEDIT) { /* edit-catching is off */ }
  else if (isRevoke && (antiOn || (isEdit && config.ANTIEDIT))) {
    const orig = msgStore.get(proto.key?.id);
    if (orig) {
      // WHO deleted it: prefer the revoke's own participant, fall back to the
      // original sender. Both are LID-resolved so a real number shows, not a
      // fake-looking `+<lid>`.
      const whoJid = proto.participant || m.key.participant || orig.key?.participant || orig.key?.remoteJid || m.key.remoteJid;
      const who = contacts.displayNum(contacts.resolve(whoJid));
      // WHERE: two different destinations, and the difference matters to her:
      //
      //   `.antidelete`        -> INBOX  = YOUR OWN chat with yourself
      //                          ("yourself" — so a deleted message lands in the
      //                          user's own inbox, private, not in the group)
      //   `.antidelete chat`   -> CHAT   = the chat it was actually deleted in
      //                          (the group / DM it originally lived in)
      //
      // Previously it ALWAYS went to the original chat, so the inbox/chat
      // distinction did nothing. `selfJid` is the session owner's own JID.
      const originJid = orig.key?.remoteJid || m.key.remoteJid;
      const originIsGroup = String(originJid).endsWith('@g.us');
      const selfJid = (session?.number ? `${session.number}@s.whatsapp.net` : '') ||
        (sock?.user?.id ? `${String(sock.user.id).split(':')[0].split('@')[0]}@s.whatsapp.net` : '');
      const toChat = !!config.ANTIDELETE_TO_CHAT;
      const whereJid = toChat ? originJid : (selfJid || originJid);
      const whereIsGroup = String(whereJid).endsWith('@g.us');
      const where = whereIsGroup ? 'Group' : (toChat ? 'Chat' : 'Yourself (inbox)');
      // Group name, when we can get it cheaply.
      let whereName = '';
      if (whereIsGroup) {
        try {
          const meta = await getGroupMeta(sock, whereJid);
          whereName = meta?.subject || '';
        } catch { /* not critical */ }
      }
      // WHEN: original send time and deletion time, in PKT.
      const pkt = (ts) => {
        try {
          return new Date(ts).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', hour12: true });
        } catch { return '—'; }
      };
      const sentAt = orig.messageTimestamp ? pkt(Number(orig.messageTimestamp) * 1000) : '—';
      const delAt = pkt(Date.now());

      const body = getText(orig);
      const kind = orig.message?.imageMessage ? '🖼️ Image'
        : orig.message?.videoMessage ? '🎬 Video'
        : orig.message?.audioMessage ? '🎵 Audio'
        : orig.message?.stickerMessage ? '🎨 Sticker'
        : orig.message?.documentMessage ? '📄 Document'
        : '📝 Text';

      try {
        await sock.sendMessage(whereJid, {
          text:
            `${isEdit ? '✏️ *ANTI-EDIT*' : '🛡️ *ANTI-DELETE*'} *(${where})*\n` +
            `━━━━━━━━━━━━━━━\n` +
            `👤 *Deleted by:* +${who}\n` +
            (whereName ? `👥 *Group:* ${whereName}\n` : '') +
            `💬 *Chat:* ${whereIsGroup ? 'Group' : 'DM'}\n` +
            `🗂️ *Type:* ${kind}\n` +
            `📤 *Sent:* ${sentAt}\n` +
            `🗑️ *Deleted:* ${delAt}\n` +
            `━━━━━━━━━━━━━━━\n\n` +
            (body ? `_Original message:_\n${body}` : '_Original message: (media)_'),
        }, { quoted: orig }).catch(() => {});
        // if it was media, re-send it to the SAME destination as the notice
        if (!body && orig.message) {
          await sock.sendMessage(whereJid, { forward: orig }, { quoted: orig }).catch(() => {});
        }
      } catch { /* ignore */ }
    }
  }

  const ctx = buildContext(sock, m, session);

  // Resolve group-admin status ONCE (cached) so every plugin AND every per-message
  // hook can rely on ctx.isAdmin. It was never set before, so `ctx.isAdmin` was
  // always undefined — group2.js's admin exemption and the admin-only gate both
  // mis-fired. getGroupMeta is warmed in the background above and de-duped, so
  // this usually hits the cache (no extra round-trip).
  if (isGroup) {
    try { ctx.isAdmin = await isGroupAdmin(sock, from, ctx.sender); } catch { ctx.isAdmin = false; }
  } else {
    ctx.isAdmin = false;
  }

  // ---- debug: record every incoming message (visible via /api/debug) ----
  debug.incoming({
    from, isGroup, sender: ctx.senderNum, text: ctx.text.slice(0, 120),
    command: ctx.command, isOwner: ctx.isOwner, fromMe: !!m.key?.fromMe,
  });

  // ---- banned users are silently ignored (owner is always allowed) ----
  if (bans.has(ctx.senderNum) && !ctx.isOwner) { debug.info('banned user ignored', { num: ctx.senderNum }); return; }

  // ---- per-message hooks (antilink, autoreact, chatbot, autostatus, …) ----
  // Run in the BACKGROUND so command replies are never delayed (speed).
  for (const hook of registry.hooks()) {
    try { Promise.resolve(hook(ctx)).catch(() => {}); } catch { /* ignore */ }
  }

  // ---- interactive replies (.wyr, .truth-or-dare, …) ----
  // A plain (non-command) message may be an answer to a pending prompt.
  if (!ctx.command) {
    const consumed = await interactions.handle(ctx).catch(() => false);
    if (consumed) return;
    return;
  }

  let plug = registry.find(ctx.command);

  // ---- typo auto-correct: if the command is misspelled, run the closest one ----
  if (!plug) {
    const maxD = ctx.command.length <= 4 ? 1 : ctx.command.length <= 7 ? 2 : 3;
    allCommandNames(); // build the length-bucketed index once (no-op afterwards)
    const { cmd, dist } = closestCommand(ctx.command, maxD);
    if (cmd && dist <= maxD) {
      ctx.command = cmd;
      plug = registry.find(cmd);
    }
  }

  if (!plug) { debug.info('no plugin for command', { command: ctx.command }); return; }

  // ---- MODE gate ---------------------------------------------------------
  // public  -> everyone can run commands (default)
  // private -> only the owner / sudo users can run commands.
  // The owner is ALWAYS allowed (fromMe + LID-resolved), so switching to
  // private can never lock the owner out of their own bot again.
  const isSudo = Array.isArray(config.SUDO) && config.SUDO.includes(ctx.senderNum);
  if (String(config.MODE).toLowerCase() === 'private' && !ctx.isOwner && !isSudo) {
    debug.info('private mode: non-owner blocked', { command: ctx.command, sender: ctx.senderNum, isGroup: ctx.isGroup });
    // Stay COMPLETELY silent — no reply at all, in groups or DMs. A "private
    // mode" bot that answers back is still answering strangers; she asked for
    // no response whatsoever.
    return;
  }

  // ---- owner-only commands (.restart, .broadcast, .ban, .pair, …) ----
  if (plug.ownerOnly && !ctx.isOwner) {
    await ctx.reply('🔒 Ye command sirf *owner* ke liye hai.').catch(() => {});
    return;
  }

  if (plug.groupOnly && !ctx.isGroup) {
    await ctx.reply('❌ Ye command sirf *group* mein chalti hai.').catch(() => {});
    return;
  }
  if (plug.adminOnly && ctx.isGroup && !ctx.isOwner) {
    const ok = ctx.isAdmin ?? await isGroupAdmin(sock, ctx.from, ctx.sender).catch(() => false);
    if (!ok) { await ctx.reply('❌ Ye command sirf *group admins* ke liye hai.').catch(() => {}); return; }
  }

  if (config.AUTO_TYPING) sock.sendPresenceUpdate('composing', ctx.from).catch(() => {}); // fire-and-forget

  try {
    debug.command({ command: ctx.command, from, sender: ctx.senderNum, isGroup });
    const _t0 = Date.now();
    await plug.handler(ctx);
    // SPEED: surface slow commands (visible via /api/debug) so bottlenecks are
    // easy to spot without host-log access.
    const _dt = Date.now() - _t0;
    if (_dt > 500) debug.info('slow command', { command: ctx.command, ms: _dt });
  } catch (e) {
    console.error(`[ERR] ${ctx.command}:`, e?.message || e);
    debug.error(`command failed: ${ctx.command}`, { error: e?.message || String(e), stack: String(e?.stack || '').split('\n').slice(0, 3).join(' | ') });
    // Self-healing: try safe auto-recoveries and report to the owner (deduped).
    try { selfheal.report(ctx.command, e, { senderNum: ctx.senderNum, isGroup: ctx.isGroup, from: ctx.from }).catch(() => {}); } catch { /* ignore */ }
    await ctx.reply(`❌ Error: ${e?.message || 'kuch ghalat ho gaya'}`).catch(() => {});
  } finally {
    if (config.AUTO_TYPING) sock.sendPresenceUpdate('paused', ctx.from).catch(() => {});
  }
}



function clearGroupMetaCache() { _groupMetaCache.clear(); }

module.exports = { handleMessage, buildContext, getText, getQuoted, isOwner, isGroupAdmin, getGroupMeta, clearGroupMetaCache, resetCommandIndex };
