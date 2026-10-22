/**
 * PREMIUM — auto/anti toggles + premium utilities
 * -----------------------------------------------
 * Toggles (live, persisted, default OFF):
 *   antidelete, antideleteinbox, antispam, autoreact, autoviewonce,
 *   autobio, chatbot, anticall, anticallmsg, autoreadstatus, online
 *
 * The `onMessage` hook runs for EVERY message and enforces:
 *   - auto-status (view/react to statuses)
 *   - anti-spam (rate-limit users)
 *   - anti-link (delete links in groups)
 *   - auto-view-once (save view-once media)
 *   - auto-react (react to messages)
 *   - chatbot (AI auto-reply in private chats)
 */
const config = require('../config');
const { getJSON, downloadMedia, pick, cleanNumber, targetOf } = require('../lib/helpers');
const { isGroupAdmin } = require('../lib/handler');
const settings = require('../lib/settings');
const reactSettings = require('../lib/reactSettings');
const userSettings = require('../lib/userSettings');
const reactMenu = require('../lib/reactMenu');
const lang = require('../lib/lang');
const reacts = require('../lib/reacts');
const contacts = require('../lib/contacts');
const { cachedProfilePic } = require('../lib/cache');

const ON_WORDS = ['on', 'true', '1', 'enable', 'enabled', 'yes', 'haan', 'han'];
const OFF_WORDS = ['off', 'false', '0', 'disable', 'disabled', 'no', 'nahi', 'na'];
const parseOnOff = (a) => {
  const s = String(a || '').trim().toLowerCase();
  if (ON_WORDS.includes(s)) return true;
  if (OFF_WORDS.includes(s)) return false;
  return null;
};
const yn = (v) => (v ? 'ON 🟢' : 'OFF 🔴');
const antideleteStatus = () => `🛡️ *Anti-Delete*\n▪️ Master: ${yn(config.ANTIDELETE)}\n▪️ Group watch: ${yn(config.ANTIDELETE)}\n▪️ Kahan aayega: *${config.ANTIDELETE_TO_CHAT ? 'Chat (jahan delete hua)' : 'Yourself (apni inbox)'}*\n\n_${config.PREFIX}antidelete inbox | ${config.PREFIX}antidelete chat_`;
const reactScopeLabel = (scope) => (
  scope === 'user' ? 'Users only (owner nahi)'
    : scope === 'owner' ? 'Owner only'
      : 'Everyone (users + owner)'
);
/**
 * Per-bot react status. `ctx` supplies the SESSION (which bot) to read, so each
 * linked number sees its OWN state — never anybody else's.
 */
const autoreactStatus = (ctx) => {
  const rs = reactSettings.get(ctx?.session?.number);
  return `😀 *Auto-React* _(is bot ke liye)_\n` +
    `▪️ Users ko react: ${yn(rs.autoReact)}\n` +
    `▪️ Kis ko react: *${reactScopeLabel(rs.reactScope)}*\n` +
    `▪️ Group: ${yn(rs.autoReactGroup)}\n` +
    `▪️ Chat: ${yn(rs.autoReactChat)}\n` +
    `▪️ Mirror emoji: ${yn(rs.mirrorEmoji)} _(same emoji wapas)_\n` +
    `▪️ Owner ko react: ${config.OWNER_REACT_EMOJI} *ALWAYS ON* 🔒\n\n` +
    `_${config.PREFIX}autoreact (menu) • ${config.PREFIX}autoreact on/off • ${config.PREFIX}mirrorreact on/off_`;
};
/** The numbered menu shown when a react command is called with NO argument. */
const reactMenuMsg = () =>
  `😀 *Auto-React Menu*\n` +
  `Kaun sa react ON karna hai? Sirf *number* reply karo:\n\n` +
  `*1* — Auto React  (sab users ko react)\n` +
  `*2* — User React  (sirf users ko, owner ko nahi)\n` +
  `*3* — Owner React  (sirf owner ko) 🔒 *ALWAYS ON*\n\n` +
  `_Note: Owner ko ${config.OWNER_REACT_EMOJI} react HAR bot hamesha karta hai — band ya change nahi ho sakta._`;
/** Owner react is LOCKED — this is the only thing `.ownerreact` ever replies. */
const ownerReactLockedMsg = () =>
  `🔒 *Owner React — LOCKED*\n` +
  `Owner ko *${config.OWNER_REACT_EMOJI}* react har bot hamesha karta hai — groups aur DMs dono mein.\n` +
  `Yeh *band ya change nahi* ho sakta (kisi bhi command se).`;
/** Apply a menu pick (1/2/3) to THIS bot only. Owner react stays locked. */
async function applyReactPick(ctx, pick) {
  const sessNum = ctx?.session?.number;
  if (pick === 1) {
    reactSettings.set(sessNum, { autoReact: true, autoReactGroup: true, autoReactChat: true, reactScope: 'all' });
  } else if (pick === 2) {
    reactSettings.set(sessNum, { autoReact: true, autoReactGroup: true, autoReactChat: true, reactScope: 'user' });
  } else if (pick === 3) {
    return ctx.reply(ownerReactLockedMsg());
  }
  return ctx.reply(`✅ *Ho gaya!*\n\n${autoreactStatus(ctx)}`);
}

const LINK_RE = /(https?:\/\/|www\.|chat\.whatsapp\.com|t\.me\/|wa\.me\/|bit\.ly|tinyurl)/i;

/* ------------------------ status / view-once helpers ---------------------- */
/** Pull the contextInfo (works for text + media messages). */
function contextOf(m) {
  return (
    m.message?.extendedTextMessage?.contextInfo ||
    m.message?.imageMessage?.contextInfo ||
    m.message?.videoMessage?.contextInfo ||
    m.message?.documentMessage?.contextInfo ||
    m.message?.audioMessage?.contextInfo ||
    null
  );
}

/** Unwrap a view-once wrapper into its inner media message. */
function unwrapViewOnce(qm) {
  if (!qm) return null;
  return qm.viewOnceMessage?.message || qm.viewOnceMessageV2?.message || qm.viewOnceMessageV2Extension?.message || null;
}

/** Emoji-only detector (popular emoji reply to restore a view-once). */
const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}\u200d\ufe0f\u2640-\u2642\u2600-\u27bf\u2b00-\u2bff\s]+$/u;
function isEmojiOnly(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 24) return false;
  if (!EMOJI_ONLY_RE.test(t)) return false;
  return /\p{Extended_Pictographic}/u.test(t);
}

/**
 * Return the FIRST emoji in `text` (grapheme-aware, so multi-codepoint emoji
 * like 👨‍👩‍👧 or 🇵🇰 come back whole), or null when there is none.
 * Used by the MIRROR auto-react: the bot reacts with the SAME emoji the user sent.
 */
const EMOJI_ONE_RE = /\p{Extended_Pictographic}(?:\u200d\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|\ufe0f)*/u;
function firstEmoji(text) {
  const t = String(text || '');
  if (!t) return null;
  const m = t.match(EMOJI_ONE_RE);
  return m ? m[0] : null;
}

// ---- Emoji Kitchen (Google gstatic) ----
const EK_DATES = ['20201001', '20210521', '20211115', '20220506', '20220823', '20230301', '20230403', '20230803'];
function cp(e) { return [...e].map((c) => c.codePointAt(0).toString(16)).join('-'); }
async function emojiKitchen(a, b) {
  const ca = cp(a); const cb = cp(b);
  const urls = [];
  for (const d of EK_DATES) {
    urls.push(`https://www.gstatic.com/android/keyboard/emojikitchen/${d}/u${ca}/u${ca}_u${cb}.png`);
    urls.push(`https://www.gstatic.com/android/keyboard/emojikitchen/${d}/u${cb}/u${cb}_u${ca}.png`);
  }
  const hits = await Promise.all(urls.map(async (u) => {
    try { const r = await fetch(u, { method: 'HEAD' }); return r.ok ? u : null; } catch { return null; }
  }));
  return hits.find(Boolean) || null;
}

// ---- anti-spam state ----
const spamMap = new Map();
const SPAM_LIMIT = 6;
const SPAM_WINDOW = 5000;

const TOGGLES = {
  antidelete: 'ANTIDELETE',
  antideleteinbox: 'ANTIDELETE_INBOX',
  antispam: 'ANTISPAM',
  autoreact: 'AUTO_REACT',
  autoviewonce: 'AUTOVIEWONCE',
  antiviewonce: 'AUTOVIEWONCE',   // alias — she types `.antiviewonce`
  antiedit: 'ANTIEDIT',
  botlanguage: null,
  autobio: 'AUTOBIO',
  chatbot: 'CHATBOT',
  anticall: 'ANTICALL',
  anticallmsg: 'ANTICALL',
  autoreadstatus: 'AUTOREAD_STATUS',
  autostatus: 'AUTOSTATUS',
  autosavestatus: 'AUTOSAVESTATUS',
  online: 'ONLINE',
};

/* ============================ per-message hook ============================ */
async function onMessage(ctx) {
  const { sock, m, from, isGroup, sender, senderNum, text, command, isOwner, session } = ctx;
  // PER-NUMBER settings: U.X is THIS bot's value for X, falling back to the
  // global config when this number never changed it. One user's toggle can
  // therefore never change another user's bot.
  const U = userSettings.eff(session?.number);
  const isStatus = from === 'status@broadcast' || m?.key?.remoteJid === 'status@broadcast';

  // ---- auto-status: view incoming statuses ----
  // The status author is m.key.participant, NOT remoteJid (which is always
  // 'status@broadcast'). Passing the wrong jid here is why reactions used to
  // go nowhere even when the feature was switched on.
  if (isStatus) {
    const author = m?.key?.participant || m?.participant || '';
    // Fire-and-forget: viewing + reacting to a status must never hold the hook.
    // VIEW (blue ring): on when .statusview / .autostatus / .autoreadstatus is on.
    const shouldView = U.AUTOSTATUS || U.AUTOREAD_STATUS || U.STATUSVIEW;
    if (shouldView) { try { sock.readMessages([m.key]).catch(() => {}); } catch { /* ignore */ } }
    // LIKE (react): on when .statuslike (STATUSLIKE) is on, or when THIS bot's
    // own auto-react is on (per-session — never another bot's).
    if ((U.STATUSLIKE || reactSettings.get(session?.number).autoReact) && author) {
      try {
        // The status reaction is ONE fixed emoji (green hand by default), NOT the
        // random auto-react set — she asked for a specific reaction on statuses.
        // Change it live with `.statusemoji <emoji>`.
        const emoji = config.STATUS_EMOJI || '🟢✋';
        sock.sendMessage('status@broadcast', {
          react: { text: emoji, key: m.key },
        }, { statusJidList: [author] }).catch(() => {});
      } catch { /* ignore */ }
    }
    return;
  }

  // ---- react menu reply: the user picked 1/2/3 --------------------------
  // When a user opens the react menu (.autoreact with no arg) we wait for their
  // next bare number. Consume it here — BEFORE anything else — and apply it to
  // THIS bot only (the owner reaction stays locked).
  {
    const picked = reactMenu.consume(senderNum, session?.number, text);
    if (picked) {
      await applyReactPick(ctx, picked.pick).catch(() => {});
      return;
    }
  }

  // ---- auto-react (FAST PATH — runs FIRST, before any slow I/O) ----
  // SPEED: this used to sit at the very END of the hook, behind anti-link
  // network lookups, view-once media downloads and status saves — so the
  // reaction only fired after all of that finished. It now runs immediately
  // (and is NOT awaited), which makes auto-react feel instant.
  {
    // Never react to a reaction (or a protocol message): otherwise two bots in
    // the same group would react to each other's reactions forever.
    const isMeta = !!(m.message?.reactionMessage || m.message?.protocolMessage);

    // ---- OWNER REACTION: LOCKED & ALWAYS ON -----------------------------
    // Every bot reacts to the OWNER's own number with the locked emoji, in
    // groups AND DMs, no matter what any toggle says. No command can change or
    // disable this. (The owner's OWN bot never sees its own messages because
    // emitOwnEvents is false, so it never reacts to itself.)
    const lockedOwnerNum = String(config.LOCKED_OWNER_NUMBER || config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
    const isLockedOwner = !!senderNum && !!lockedOwnerNum && senderNum === lockedOwnerNum;

    // ---- PER-BOT (per-session) user react settings ----------------------
    const rs = reactSettings.get(session?.number);
    const whereOk = isGroup ? rs.autoReactGroup : rs.autoReactChat;
    const userAllowed = rs.reactScope === 'all' || rs.reactScope === 'user';

    let shouldReact = false;
    let emoji = null;
    if (isLockedOwner) {
      shouldReact = true;                                   // ALWAYS, no matter what
      emoji = config.OWNER_REACT_EMOJI || '🧑‍💻';
    } else if (!isOwner) {
      // ---- MIRROR REACT: react with the EXACT emoji the user sent ----------
      // When a user sends an emoji-only message, the bot reacts to THAT message
      // using the SAME emoji (per-bot `mirrorEmoji`, default ON). This takes
      // precedence over the random auto-react emoji so the bot truly mirrors.
      // It still respects this bot's group/chat + scope settings.
      const mirrored = (rs.mirrorEmoji && whereOk && userAllowed && !command && isEmojiOnly(text))
        ? firstEmoji(text) : null;
      if (mirrored) {
        shouldReact = true;
        emoji = mirrored;
      } else {
        // Normal users: only when THIS bot's auto-react is on, in the allowed
        // chat type, and the scope includes users ('all' or 'user'). Commands
        // are skipped so the bot does not react to every command a user runs.
        shouldReact = rs.autoReact && whereOk && userAllowed && !command;
        emoji = pick(reacts.forUser(senderNum, config.REACT_EMOJIS));
      }
    }

    if (!isMeta && shouldReact && emoji) {
      try { sock.sendMessage(from, { react: { text: emoji, key: m.key } }).catch(() => {}); } catch { /* ignore */ }
    }
  }

  // ---- anti-spam ----
  if (U.ANTISPAM && !isOwner) {
    const now = Date.now();
    const rec = spamMap.get(sender) || { count: 0, ts: now };
    if (now - rec.ts > SPAM_WINDOW) { rec.count = 0; rec.ts = now; }
    rec.count += 1;
    spamMap.set(sender, rec);
    if (rec.count === SPAM_LIMIT + 1) {
      await sock.sendMessage(from, { text: `🚫 *Anti-Spam:* +${contacts.displayNum(ctx.senderNum)} thoda slow karo!` }).catch(() => {});
      return;
    }
    if (rec.count > SPAM_LIMIT) return;
  }

  // ---- anti-link (groups) ----
  if (U.ANTILINK && isGroup && !isOwner && text && LINK_RE.test(text)) {
    const admin = await isGroupAdmin(sock, from, sender).catch(() => false);
    if (!admin) {
      try {
        await sock.sendMessage(from, { delete: m.key });
        await sock.sendMessage(from, { text: `🔗 *Anti-Link:* +${contacts.displayNum(ctx.senderNum)} link bhejna mana hy!` }).catch(() => {});
      } catch { /* ignore */ }
      return;
    }
  }

  // ---- auto-view-once: save view-once media to owner ----
  if (U.AUTOVIEWONCE) {
    const vo = m.message?.viewOnceMessage?.message || m.message?.viewOnceMessageV2?.message || m.message?.viewOnceMessageV2Extension?.message;
    if (vo) {
      try {
        const img = vo.imageMessage;
        const vid = vo.videoMessage;
        const media = img || vid;
        if (media) {
          const type = img ? 'image' : 'video';
          const buf = await downloadMedia(media, type);
          // Destination = the user's OWN inbox ("yourself"), i.e. their own chat
          // with themselves — NOT the chat it was sent in, and not just the
          // owner's number. `session.number` is the paired number; fall back to
          // the owner number / the current chat if it is somehow missing.
          const selfNum = session?.number || config.OWNER_NUMBER || ctx.senderNum;
          const target = selfNum ? `${selfNum}@s.whatsapp.net` : from;
          const cap = `👁️ *View-Once Saved*\n👤 +${contacts.displayNum(ctx.senderNum)}\n💬 ${media.caption || ''}`;
          if (type === 'image') await sock.sendMessage(target, { image: buf, caption: cap });
          else await sock.sendMessage(target, { video: buf, caption: cap });
        }
      } catch { /* ignore */ }
    }
  }

  // ---- reply to a STATUS -> auto-save the status media/text to owner ----
  if (U.AUTOSAVESTATUS) {
    const ci = contextOf(m);
    if (ci && ci.remoteJid === 'status@broadcast' && ci.quotedMessage) {
      const q = ci.quotedMessage;
      // Send it to the USER'S OWN INBOX (their chat with themselves), not to
      // their personal number in a separate chat. "inbox" = yourself.
      const selfNum = session?.number || config.OWNER_NUMBER;
      const ownerJid = selfNum ? `${selfNum}@s.whatsapp.net` : from;
      const who = cleanNumber((ci.participant || m.key.participant || from || '').split('@')[0].split(':')[0]);
      try {
        if (q.imageMessage) {
          const buf = await downloadMedia(q.imageMessage, 'image');
          await sock.sendMessage(ownerJid, { image: buf, caption: `📥 *Status Saved*\n👤 +${contacts.displayNum(who)}\n💬 ${q.imageMessage.caption || ''}` });
        } else if (q.videoMessage) {
          const buf = await downloadMedia(q.videoMessage, 'video');
          await sock.sendMessage(ownerJid, { video: buf, caption: `📥 *Status Saved*\n👤 +${contacts.displayNum(who)}\n💬 ${q.videoMessage.caption || ''}` });
        } else {
          const txt = q.conversation || q.extendedTextMessage?.text || '';
          if (txt) await sock.sendMessage(ownerJid, { text: `📥 *Status Saved*\n👤 +${contacts.displayNum(who)}\n\n${txt}` });
        }
      } catch { /* ignore */ }
    }
  }

  // ---- reply to a VIEW-ONCE with a popular emoji -> auto-restore (no cmd) ----
  {
    const ci = contextOf(m);
    const replyText = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
    if (ci && ci.quotedMessage && isEmojiOnly(replyText)) {
      const inner = unwrapViewOnce(ci.quotedMessage);
      const src = inner || ci.quotedMessage;
      const media = src.imageMessage || src.videoMessage;
      const isViewOnce = !!inner || !!media?.viewOnce;
      if (media && isViewOnce) {
        const type = src.imageMessage ? 'image' : 'video';
        try {
          const buf = await downloadMedia(media, type);
          const cap = `🔓 *View-once restored*\n👑 ${config.BOT_NAME}`;
          if (type === 'image') await sock.sendMessage(from, { image: buf, caption: cap }, { quoted: m });
          else await sock.sendMessage(from, { video: buf, caption: cap }, { quoted: m });
        } catch { /* ignore */ }
        return; // handled — skip auto-react for this emoji
      }
    }
  }

  // (auto-react now runs at the TOP of this hook — see the FAST PATH block.)

  // ---- chatbot (AI auto-reply, private chats only, non-command) ----
  if (U.CHATBOT && !command && !isGroup && text && !isOwner) {
    try {
      const ai = require('./ai');
      const answer = await ai.askAI(text);
      await sock.sendMessage(from, { text: answer }, { quoted: m });
    } catch { /* ignore */ }
  }
}

/* ============================ commands ============================ */
const handler = async (ctx) => {
  const { command, reply, arg, senderNum, session } = ctx;
  // Write THIS bot's own settings (never the shared config).
  const setU = (patch) => userSettings.set(session?.number, patch);

  // ---- anti-delete ----
  //   .antidelete              -> master on/off
  //   .antidelete inbox        -> WHERE: the deleted message is sent to YOUR OWN
  //                               chat with yourself (private inbox)
  //   .antidelete chat         -> WHERE: the deleted message is sent back into
  //                               the chat it was actually deleted in
  //   .antidelete group        -> watch GROUPS
  //   .antidelete all          -> everything on/off
  // The inbox/chat choice is the destination; it is independent of whether
  // groups or DMs are watched.
  if (command === 'antidelete' || command === 'antideleteinbox') {
    const parts = String(arg || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const scope = ['chat', 'inbox', 'group', 'all', 'status', 'show', 'where']
      .includes(parts[0]) ? parts[0] : null;
    if (scope === 'status' || scope === 'show' || scope === 'where') return reply(antideleteStatus());

    // Destination: inbox (yourself) or chat (where it happened).
    if (scope === 'inbox' || scope === 'chat') {
      const v = parseOnOff(parts[1]);
      // `.antidelete inbox` -> destination = YOUR OWN inbox  (ANTIDELETE_TO_CHAT = false)
      // `.antidelete chat`  -> destination = where it was deleted (ANTIDELETE_TO_CHAT = true)
      // Bare (no on/off) means "use this destination" — so it sets, not toggles.
      setU({ ANTIDELETE_TO_CHAT: v === null ? (scope === 'chat') : v });
      // Choosing a destination implies turning the feature on.
      if (v === null || v === true) setU({ ANTIDELETE: true });
      settings.save();
      await reply(
        `✅ Anti-delete ab *${U.ANTIDELETE_TO_CHAT ? 'CHAT me' : 'YOURSELF (inbox) me'}* aayega.\n` +
        `_(jahan delete hua wahi: \`${config.PREFIX}antidelete chat\` | apni inbox: \`${config.PREFIX}antidelete inbox\`)_`
      );
      return;
    }

    if (command === 'antideleteinbox') { setU({ ANTIDELETE: true, ANTIDELETE_TO_CHAT: false }); await reply(antideleteStatus()); return; }

    const val = parseOnOff(parts[scope ? 1 : 0]);
    if (scope === 'group') setU({ ANTIDELETE: val === null ? !U.ANTIDELETE : val });
    else if (scope === 'all') { const v = val === null ? !(U.ANTIDELETE || U.ANTIDELETE_INBOX) : val; setU({ ANTIDELETE: v, ANTIDELETE_INBOX: v }); }
    else setU({ ANTIDELETE: val === null ? !U.ANTIDELETE : val });
    settings.save();
    await reply(antideleteStatus());
    return;
  }

  // ---- anti-edit: catch a message being EDITED and show old vs new ----
  if (command === 'antiedit') {
    const parts = String(arg || '').trim().split(/\s+/).filter(Boolean);
    const sub = (parts[0] || '').toLowerCase();
    if (!parts.length || sub === 'show' || sub === 'status') {
      return reply(
        `✏️ *ANTI-EDIT*\n` +
        `━━━━━━━━━━━━━━━\n` +
        `▪️ Abhi: *${U.ANTIEDIT ? 'ON 🟢' : 'OFF 🔴'}*\n` +
        `━━━━━━━━━━━━━━━\n` +
        `*Batao kya karna hy?*\n` +
        `▪️ \`${config.PREFIX}antiedit on\` — edited messages pakro\n` +
        `▪️ \`${config.PREFIX}antiedit off\` — band karo\n` +
        `_(edit hone par purana + naya text dono aayenge)_`
      );
    }
    const val = parseOnOff(sub);
    if (val === null) return reply(`❓ \`${config.PREFIX}antiedit on\` ya \`${config.PREFIX}antiedit off\` likho.`);
    setU({ ANTIEDIT: val });
    settings.save();
    return reply(`✅ Anti-Edit ab *${val ? 'ON 🟢' : 'OFF 🔴'}* hy.`);
  }

  // ---- bot language (100+ languages) ----
  //   .botlanguage              -> show current + hint
  //   .botlanguage list [n]     -> browse all languages (paginated)
  //   .botlanguage <code|name>  -> set the bot's language for YOU
  //   .botlanguage reset        -> back to English
  if (command === 'botlanguage' || command === 'lang' || command === 'language') {
    const parts = String(arg || '').trim().split(/\s+/).filter(Boolean);
    const sub = (parts[0] || '').toLowerCase();
    const me = lang.infoFor(senderNum);

    if (!parts.length) {
      await reply(
        `🌍 *BOT LANGUAGE*\n` +
        `━━━━━━━━━━━━━━━\n` +
        `▪️ Abhi: *${me.name}* (${me.native}) — \`${me.code}\`\n` +
        `▪️ Total: *${Object.keys(lang.LANGS).length}* languages\n` +
        `━━━━━━━━━━━━━━━\n` +
        `\`${config.PREFIX}botlanguage list\` — sab dekho\n` +
        `\`${config.PREFIX}botlanguage ur\` — Urdu laga do\n` +
        `\`${config.PREFIX}botlanguage english\` — English\n` +
        `\`${config.PREFIX}botlanguage reset\` — default`
      );
      return;
    }

    if (sub === 'list' || sub === 'all') {
      const page = Math.max(1, parseInt(parts[1], 10) || 1);
      const per = 30;
      const entries = Object.entries(lang.LANGS);
      const total = Math.ceil(entries.length / per);
      const slice = entries.slice((page - 1) * per, page * per);
      if (!slice.length) return reply(`❌ Page ${page} nahi hy. Total ${total} pages.`);
      await reply(
        `🌍 *LANGUAGES* (${entries.length}) — page ${page}/${total}\n` +
        `━━━━━━━━━━━━━━━\n` +
        slice.map(([c, [en, nat]]) => `▪️ \`${c}\` — ${en}${nat !== en ? ` (${nat})` : ''}`).join('\n') +
        `\n━━━━━━━━━━━━━━━\n\`${config.PREFIX}botlanguage list ${page + 1}\` — agla page`
      );
      return;
    }

    if (sub === 'reset' || sub === 'default') {
      lang.reset(senderNum);
      await reply('✅ Language *English* par wapas aa gayi.');
      return;
    }

    // exact code first, then fuzzy search by name
    const code = lang.set(senderNum, sub);
    if (code) {
      const [en, nat] = lang.LANGS[code];
      await reply(`✅ Bot ki language ab *${en}* (${nat}) hy.\n_AI replies isi language me aayenge._`);
      return;
    }
    const hits = lang.search(parts.join(' '));
    if (hits.length === 1) {
      const [c, [en, nat]] = hits[0];
      lang.set(senderNum, c);
      await reply(`✅ Bot ki language ab *${en}* (${nat}) hy.`);
      return;
    }
    if (hits.length > 1) {
      return reply(
        `🤔 *${hits.length}* languages mili — exact code likho:\n` +
        hits.slice(0, 15).map(([c, [en]]) => `▪️ \`${c}\` — ${en}`).join('\n')
      );
    }
    await reply(
      `❌ \`${parts[0]}\` nahi mili.\n` +
      `\`${config.PREFIX}botlanguage list\` se sab ${Object.keys(lang.LANGS).length} languages dekho.`
    );
    return;
  }

  // ---- auto-react: the react commands (PER BOT) --------------------------
  //   .autoreact            -> show the NUMBERED menu (reply 1/2/3)
  //   .autoreact on|off     -> react to normal users for THIS bot
  //   .autoreact group|chat -> where it applies (group / DM), THIS bot
  //   .autoreact all on|off -> master + group + chat in one shot, THIS bot
  //   .userreact on|off     -> react to users only, THIS bot
  //   .ownerreact           -> LOCKED: owner is ALWAYS reacted to (info only)
  //   .reactemoji           -> LOCKED (info only)
  if (command === 'autoreact' || command === 'userreact' || command === 'ownerreact' || command === 'reactmenu') {
    // `.ownerreact` is LOCKED — it can NEVER turn the owner reaction off or
    // change it, whatever the argument. Just explain that.
    if (command === 'ownerreact') return reply(ownerReactLockedMsg());

    const parts = String(arg || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const where = ['chat', 'group', 'all', 'status', 'show', 'menu'].includes(parts[0]) ? parts[0] : null;

    // No argument (or `menu`) -> show the numbered menu and wait for 1/2/3.
    if (!parts.length || where === 'menu') {
      reactMenu.arm(senderNum, session?.number);
      return reply(reactMenuMsg());
    }
    // `.autoreact show` / `.autoreact status` -> just print THIS bot's state.
    if (where === 'status' || where === 'show') return reply(autoreactStatus(ctx));

    const val = parseOnOff(parts[where ? 1 : 0]);
    const sessNum = session?.number;
    const cur = reactSettings.get(sessNum);
    if (where === 'chat') {
      reactSettings.set(sessNum, { autoReactChat: val === null ? !cur.autoReactChat : val });
    } else if (where === 'group') {
      reactSettings.set(sessNum, { autoReactGroup: val === null ? !cur.autoReactGroup : val });
    } else if (where === 'all') {
      const v = val === null ? !cur.autoReact : val;
      reactSettings.set(sessNum, { autoReact: v, autoReactGroup: v, autoReactChat: v });
    } else {
      // Scope command: flip THIS bot's master AND remember WHO is reacted to.
      const on = val === null ? !cur.autoReact : val;
      const patch = { autoReact: on };
      if (command === 'userreact') { if (on) patch.reactScope = 'user'; }
      else if (on) patch.reactScope = 'all';
      reactSettings.set(sessNum, patch);
    }
    await reply(autoreactStatus(ctx));
    return;
  }

  // ---- .mirrorreact — MIRROR the user's exact emoji (per bot) -------------
  //   .mirrorreact           -> show status
  //   .mirrorreact on|off    -> toggle (default ON)
  // When ON, any emoji-only message a user sends gets the SAME emoji back as a
  // reaction to that message. Respects this bot's group/chat + scope settings.
  if (command === 'mirrorreact' || command === 'mirror') {
    const word = String(arg || '').trim().toLowerCase().split(/\s+/)[0];
    const val = parseOnOff(word);
    if (val === null) return reply(autoreactStatus(ctx));
    reactSettings.set(session?.number, { mirrorEmoji: val });
    return reply(`✅ *Mirror Emoji* ab *${val ? 'ON 🟢' : 'OFF 🔴'}* hy.\n\n${autoreactStatus(ctx)}`);
  }

  // ---- .reactemoji — LOCKED (the owner emoji can never be changed) --------
  if (command === 'reactemoji' || command === 'ownerreactemoji' || command === 'owneremoji') {
    return reply(ownerReactLockedMsg());
  }

  // ---- .setreact — each user picks their OWN auto-react emojis ----
  if (command === 'setreact' || command === 'myreact' || command === 'reacts') {
    const raw = String(arg || '').trim();
    if (!raw) {
      const mine = reacts.forUser(senderNum, config.REACT_EMOJIS);
      return reply(
        `😀 *Tumhare auto-react emojis*\n${mine.join(' ')}\n\n` +
        `Badalne ke liye: \`${config.PREFIX}setreact 🔥 ❤️ 🎉\`\n` +
        `Default par wapas: \`${config.PREFIX}setreact reset\``
      );
    }
    if (/^(reset|default|clear|off)$/i.test(raw)) {
      reacts.reset(senderNum);
      return reply(`✅ Tumhare react emojis *default* par wapas aa gaye: ${config.REACT_EMOJIS.join(' ')}`);
    }
    const list = raw.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    if (!list.length) return reply(`❌ Emojis likho. Example: \`${config.PREFIX}setreact 🔥 ❤️ 🎉\``);
    if (!reacts.set(senderNum, list)) return reply('❌ Emojis save nahi ho sake, dobara try karo.');
    return reply(`✅ *Ho gaya!* Ab tumhare auto-react emojis:\n${reacts.forUser(senderNum, config.REACT_EMOJIS).join(' ')}\n\n_(${config.PREFIX}setreact reset se default wapas)_`);
  }

  // ---- simple toggles ----
  // Supports explicit args: `.antispam on` -> ON, `.antispam off` -> OFF.
  // With no arg it flips the current state.
  // ---- anti-call (special: asks instead of guessing, and supports a message) ----
  //   .anticall              -> bot ASKS "on ya off?" instead of flipping blindly
  //   .anticall on / off     -> set it
  //   .anticall message <txt>-> custom text sent when a call is rejected
  //   .anticall message clear-> stop sending any text (silent reject)
  //   .anticall show         -> current state
  if (command === 'anticall' || command === 'anticallmsg') {
    const parts = String(arg || '').trim().split(/\s+/).filter(Boolean);
    const sub = (parts[0] || '').toLowerCase();

    if (!parts.length) {
      return reply(
        `📵 *ANTI-CALL*\n` +
        `━━━━━━━━━━━━━━━\n` +
        `▪️ Abhi: *${U.ANTICALL ? 'ON 🟢' : 'OFF 🔴'}*\n` +
        `▪️ Message: ${U.ANTICALL_MSG ? `_${U.ANTICALL_MSG}_` : '_koi nahi (chup chap reject)_'}\n` +
        `━━━━━━━━━━━━━━━\n` +
        `*Batao kya karna hy:*\n` +
        `▪️ \`${config.PREFIX}anticall on\` — calls reject karo\n` +
        `▪️ \`${config.PREFIX}anticall off\` — calls aane do\n` +
        `▪️ \`${config.PREFIX}anticall message <text>\` — apna message lagao\n` +
        `▪️ \`${config.PREFIX}anticall message clear\` — message hatao`
      );
    }

    if (sub === 'show' || sub === 'status') {
      return reply(`📵 Anti-Call: *${U.ANTICALL ? 'ON 🟢' : 'OFF 🔴'}*\n💬 Message: ${U.ANTICALL_MSG || '_koi nahi_'}`);
    }

    if (sub === 'message' || sub === 'msg') {
      const rest = parts.slice(1).join(' ').trim();
      if (!rest) return reply(`❌ Message likho: \`${config.PREFIX}anticall message Aap call na karein.\``);
      if (['clear', 'reset', 'none', 'off', 'hatao'].includes(rest.toLowerCase())) {
        setU({ ANTICALL_MSG: '' });
        settings.save();
        return reply('✅ Anti-Call message hata diya — ab call chup chap reject hogi.');
      }
      setU({ ANTICALL_MSG: rest });
      settings.save();
      return reply(`✅ Anti-Call message set: _${rest}_\n_(call reject hone par ye bheja jayega)_`);
    }

    const val = parseOnOff(sub);
    if (val === null) {
      return reply(`❓ Samajh nahi aaya. \`${config.PREFIX}anticall on\` ya \`${config.PREFIX}anticall off\` likho.`);
    }
    setU({ ANTICALL: val });
    settings.save();
    return reply(`✅ Anti-Call ab *${val ? 'ON 🟢' : 'OFF 🔴'}* hy.`);
  }

  // ---- every other on/off toggle ----
  // Bare `.antilink` used to silently FLIP the setting, which is confusing (she
  // typed `.anticall` expecting a question and got "off"). Now: no argument =>
  // ask which one; explicit on/off => set it. Same style for every toggle.
  if (TOGGLES[command]) {
    const key = TOGGLES[command];
    const val = parseOnOff(arg);
    if (val === null) {
      return reply(
        `⚙️ *${command.toUpperCase()}*\n` +
        `━━━━━━━━━━━━━━━\n` +
        `▪️ Abhi: *${U[key] ? 'ON 🟢' : 'OFF 🔴'}*\n` +
        `━━━━━━━━━━━━━━━\n` +
        `Batao kya karna hy?\n` +
        `▪️ \`${config.PREFIX}${command} on\`\n` +
        `▪️ \`${config.PREFIX}${command} off\``
      );
    }
    // PER-NUMBER: this only changes the CALLER's bot. Other linked numbers keep
    // their own value (and their own saved state across restarts).
    if (key && userSettings.KEYS.includes(key)) setU({ [key]: val });
    else { config[key] = val; settings.save(); }

    // `.online` needs a LIVE presence update. markOnlineOnConnect only applies
    // when the socket is first created, so flipping the flag on an already
    // connected socket did nothing at all — which is why .online looked broken.
    if (key === 'ONLINE') {
      try {
        await ctx.sock.sendPresenceUpdate(U.ONLINE ? 'available' : 'unavailable');
      } catch { /* ignore */ }
    }

    await reply(`✅ *${command.toUpperCase()}* ab *${U[key] ? 'ON 🟢' : 'OFF 🔴'}* hy.`);
    return;
  }

  switch (command) {
    case 'premium':
      await reply(
        `👑 *${config.BOT_NAME} — PREMIUM*\n\n` +
        `🛡️ Anti-Delete: ${U.ANTIDELETE ? 'ON 🟢' : 'OFF 🔴'}\n` +
        `📥 Anti-Delete Inbox: ${U.ANTIDELETE_INBOX ? 'ON 🟢' : 'OFF 🔴'}\n` +
        `🔗 Anti-Link: ${U.ANTILINK ? 'ON 🟢' : 'OFF 🔴'}\n` +
        `🚫 Anti-Spam: ${U.ANTISPAM ? 'ON 🟢' : 'OFF 🔴'}\n` +
        `📵 Anti-Call: ${U.ANTICALL ? 'ON 🟢' : 'OFF 🔴'}\n` +
        `😀 Auto-React: ${reactSettings.get(session?.number).autoReact ? 'ON 🟢' : 'OFF 🔴'}\n` +
        `🪞 Mirror Emoji: ${reactSettings.get(session?.number).mirrorEmoji ? 'ON 🟢' : 'OFF 🔴'}\n` +
        `👁️ Auto-ViewOnce: ${U.AUTOVIEWONCE ? 'ON 🟢' : 'OFF 🔴'}\n` +
        `📊 Auto-Status: ${U.AUTOSTATUS ? 'ON 🟢' : 'OFF 🔴'}\n` +
        `🤖 Chatbot: ${U.CHATBOT ? 'ON 🟢' : 'OFF 🔴'}\n\n` +
        `_Toggle: ${config.PREFIX}antidelete / ${config.PREFIX}antilink / ${config.PREFIX}autoreact …_`
      );
      return;

    case 'readmore':
      if (!arg) return reply(`❌ Example: ${config.PREFIX}readmore Hello`);
      await reply(`${arg}\n${'\u200b'.repeat(4000)}\n${arg}`);
      return;

    case 'vcf': {
      const num = (arg || '').replace(/[^0-9]/g, '');
      if (!num) return reply(`❌ Number do. Example: ${config.PREFIX}vcf 923001234567`);
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${config.OWNER_NAME}\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD`;
      await ctx.send(ctx.from, { contacts: { displayName: config.OWNER_NAME, contacts: [{ vcard }] } }, { quoted: ctx.m });
      return;
    }

    case 'say': case 'speak': case 'voice': {
      if (!arg) return reply(`❌ Text do. Example: ${config.PREFIX}say Assalam o alaikum`);
      try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(arg)}&tl=ur&client=tw-ob`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) throw new Error('TTS fail');
        const buf = Buffer.from(await res.arrayBuffer());
        await ctx.send(ctx.from, { audio: buf, mimetype: 'audio/mpeg', ptt: true }, { quoted: ctx.m });
      } catch { await reply('❌ TTS fail ho gaya.'); }
      return;
    }

    case 'carbon': {
      if (!arg) return reply(`❌ Code do. Example: ${config.PREFIX}carbon console.log("hi")`);
      try {
        const res = await fetch('https://carbonara.solopov.dev/api/cook', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: arg, language: 'auto', theme: 'dracula' }),
        });
        if (!res.ok) throw new Error('carbon fail');
        const buf = Buffer.from(await res.arrayBuffer());
        await ctx.send(ctx.from, { image: buf, caption: '🎨 Code → Image' }, { quoted: ctx.m });
      } catch { await reply('❌ Carbon fail ho gaya.'); }
      return;
    }

    case 'ss': {
      if (!arg) return reply(`❌ URL do. Example: ${config.PREFIX}ss https://google.com`);
      try {
        const url = arg.startsWith('http') ? arg : 'https://' + arg;
        const r = await getJSON(`https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&waitUntil=networkidle0`);
        const shot = r?.data?.screenshot?.url;
        if (!shot) throw new Error('no shot');
        await ctx.send(ctx.from, { image: { url: shot }, caption: `📸 Screenshot\n🔗 ${url}` }, { quoted: ctx.m });
      } catch { await reply('❌ Screenshot fail ho gaya.'); }
      return;
    }

    case 'tourl': {
      const imgMsg = ctx.m.message?.imageMessage || ctx.quoted?.message?.imageMessage;
      if (!imgMsg) return reply(`❌ Kisi image ko reply karo ya image ke sath likho ${config.PREFIX}tourl`);
      try {
        const buf = await downloadMedia(imgMsg, 'image');
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', new Blob([buf]), 'image.jpg');
        const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
        const url = (await res.text()).trim();
        if (!url.startsWith('http')) throw new Error('upload fail');
        await reply(`🔗 *URL:* ${url}`);
      } catch { await reply('❌ Upload fail ho gaya.'); }
      return;
    }

    case 'emojimix': case 'emix': {
      const [a, b] = (arg || '').split(/\s+/);
      if (!a || !b) return reply(`❌ Do emoji do. Example: ${config.PREFIX}emojimix 😂 🥰`);
      try {
        const url = await emojiKitchen(a, b);
        if (!url) throw new Error('no mix');
        await ctx.send(ctx.from, { image: { url }, caption: `${a} + ${b} 🎨` }, { quoted: ctx.m });
      } catch { await reply('❌ Ye emoji combo support nahi hy. Koi aur combo try karo.'); }
      return;
    }

    case 'pp': case 'profilepic': case 'getdp': {
      const target = targetOf(ctx);
      const who = target ? target.jid : ctx.sender;
      try {
        const pp = await cachedProfilePic(ctx.sock, who, 'image');
        await ctx.send(ctx.from, {
          image: { url: pp },
          caption: `🖼️ *Profile Picture*\n👤 @${target ? target.num : ctx.senderNum}`,
          mentions: [who],
        }, { quoted: ctx.m });
      } catch { await reply('❌ DP nahi mili ya private hy.'); }
      return;
    }

    case 'gpp': case 'groupdp': case 'getgcdp': {
      if (!ctx.isGroup) return reply('❌ Ye command sirf group me chalti hy.');
      try {
        const pp = await cachedProfilePic(ctx.sock, ctx.from, 'image');
        await ctx.send(ctx.from, { image: { url: pp }, caption: `🖼️ *Group Profile Picture*\n👑 ${config.BOT_NAME}` }, { quoted: ctx.m });
      } catch { await reply('❌ Group DP nahi mili.'); }
      return;
    }

    default:
      await reply('❓ Unknown premium command');
  }
};

module.exports = {
  commands: [
    ...Object.keys(TOGGLES), 'premium', 'readmore', 'vcf', 'say', 'speak', 'voice', 'carbon', 'ss', 'tourl', 'emojimix', 'emix',
    'pp', 'profilepic', 'getdp', 'gpp', 'groupdp', 'getgcdp',
    'setreact', 'myreact', 'reacts',
    'userreact', 'ownerreact', 'reactmenu', 'reactemoji', 'ownerreactemoji', 'owneremoji', 'mirrorreact',
  ],
  category: '💎 PREMIUM',
  handler,
  onMessage,
};
