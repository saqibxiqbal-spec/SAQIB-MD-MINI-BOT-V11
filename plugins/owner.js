/**
 * OWNER — owner-only commands
 *
 * .vv2  -> unlocks view-once media and sends it to the bot's OWN chat
 *          ("Message yourself"), then auto-deletes it after a few seconds.
 * .vv / .vv3 -> unlocks and sends it to the current chat (normal).
 * .ban / .unban / .banlist -> block + ignore a user's number.
 */
const config = require('../config');
const { downloadMedia, cleanNumber } = require('../lib/helpers');
const bans = require('../lib/bans');
const apikeys = require('../lib/apikeys');
const apikeyFlow = require('../lib/apikeyFlow');

const SELF_DELETE_MS = 10000; // .vv2 self-message auto-delete delay

/** Unwrap view-once wrappers into the inner media message. */
function unwrapViewOnce(qm) {
  if (!qm) return null;
  return (
    qm.viewOnceMessage?.message ||
    qm.viewOnceMessageV2?.message ||
    qm.viewOnceMessageV2Extension?.message ||
    qm
  );
}

const handler = async (ctx) => {
const appeals = require('../lib/appeals');
  const { sock, command, reply, quoted } = ctx;

  switch (command) {
    case 'vv': case 'vv2': case 'vv3': {
      if (!quoted) return reply('❌ View-once media ko *reply* kar ke .vv likho.');
      const qm = unwrapViewOnce(quoted.message);
      const type = qm.imageMessage ? 'image' : qm.videoMessage ? 'video' : qm.audioMessage ? 'audio' : null;
      if (!type) return reply('❌ Ye view-once media nahi lag raha (image/video par reply karo).');
      const msg = qm.imageMessage || qm.videoMessage || qm.audioMessage;
      let buf;
      try { buf = await downloadMedia(msg, type); }
      catch (e) { return reply('❌ Media download nahi ho saki (expired ho sakti hy): ' + String(e.message || e).slice(0, 80)); }
      const cap = `🔓 *View-once unlocked*\n👑 ${config.BOT_NAME}`;
      const toSelf = command === 'vv2';
      // Resolve the bot's OWN number. Prefer the session number (always a real
      // MSISDN); fall back to sock.user.id, but ignore it when it is a LID
      // (a LID is not a phone number and would send to a bogus chat).
      let selfNum = cleanNumber(String(ctx.session?.number || '').split(':')[0].split('@')[0]);
      if (!selfNum) {
        const uid = String(sock.user?.id || '');
        if (uid && !uid.endsWith('@lid')) selfNum = cleanNumber(uid.split(':')[0].split('@')[0]);
      }
      const selfJid = selfNum ? `${selfNum}@s.whatsapp.net` : ctx.from;
      const target = toSelf ? selfJid : ctx.from;
      const opts = toSelf ? {} : { quoted: ctx.m };

      let sent;
      if (type === 'image') sent = await ctx.send(target, { image: buf, caption: cap }, opts);
      else if (type === 'video') sent = await ctx.send(target, { video: buf, caption: cap }, opts);
      else sent = await ctx.send(target, { audio: buf, mimetype: 'audio/mpeg' }, opts);

      if (toSelf) {
        await reply(`✅ View-once tumhari *own chat (yourself)* me bhej diya.\n🕐 ${Math.round(SELF_DELETE_MS / 1000)} sec me auto-delete ho jayega.`);
        setTimeout(() => { try { sock.sendMessage(target, { delete: sent.key }); } catch { /* ignore */ } }, SELF_DELETE_MS);
      }
      break;
    }
    case 'forward': {
      if (!quoted) return reply('❌ Kisi message ko reply karo.');
      if (!ctx.arg) return reply(`❌ Number do. Example: ${config.PREFIX}forward 923xxxxxxxxxx`);
      const jid = cleanNumber(ctx.arg) + '@s.whatsapp.net';
      await sock.copyNForward(jid, quoted.message, true);
      await reply(`✅ Forward ho gaya -> +${jid.split('@')[0]}`);
      break;
    }
    case 'block': case 'unblock': {
      const num = cleanNumber(quoted ? (quoted.key.participant || quoted.key.remoteJid) : ctx.arg);
      if (!num) return reply('❌ Number do ya reply karo.');
      await sock.updateBlockStatus(num + '@s.whatsapp.net', command === 'block' ? 'block' : 'unblock');
      await reply(`${command === 'block' ? '🚫' : '✅'} +${num} ${command}ed.`);
      break;
    }
    case 'ban': {
      const num = cleanNumber(quoted ? (quoted.key.participant || quoted.key.remoteJid) : ctx.arg);
      if (!num) return reply('❌ Number do ya kisi ko reply karo.');
      bans.add(num);
      await sock.updateBlockStatus(num + '@s.whatsapp.net', 'block').catch(() => {});
      await reply(`🚫 +${num} *BAN* kar diya gaya (blocked + ignored).`);
      break;
    }
    // ---- .unban -----------------------------------------------------------
    // Two different jobs share this command, because users ask for both:
    //   .unban <number>            -> lift OUR ban (block + ignore) on a user
    //   .unban <platform> appeal   -> that platform's OWN appeal route
    // The second one exists because "unban me from Instagram/WhatsApp" is a
    // completely different thing from our bot's ban list, and each platform
    // has its own address. No API, all static text.
    case 'unban': {
      const a = String(ctx.arg || '').trim();
      // .unban whatsapp appeal   /   .unban appeal instagram
      const words = a.toLowerCase().split(/\s+/).filter(Boolean);
      const wantsAppeal = words.includes('appeal') || words.includes('unblock') || words.includes('help');
      if (wantsAppeal) {
        const platform = words.filter((w) => w !== 'appeal' && w !== 'unblock' && w !== 'help').join(' ');
        const info = appeals.lookup(platform);
        if (!info) {
          return reply(
            `📮 *Ban Appeal*\n\nKis platform ka? Example:\n` +
            `${config.PREFIX}unban whatsapp appeal\n${config.PREFIX}unban instagram appeal\n\n` +
            `_Available:_ ${appeals.listAll()}`
          );
        }
        return reply(appeals.render(info));
      }
      const num = cleanNumber(quoted ? (quoted.key.participant || quoted.key.remoteJid) : ctx.arg);
      if (!num) {
        return reply(
          `ℹ️ *Unban kaise karein?*\n\n` +
          `▸ *${config.PREFIX}unban <number>* — is bot ka ban hatao\n` +
          `▸ *${config.PREFIX}unban <platform> appeal* — us app se unban ka tareeqa\n\n` +
          `_Platforms:_ ${appeals.listAll()}`
        );
      }
      bans.remove(num);
      await sock.updateBlockStatus(num + '@s.whatsapp.net', 'unblock').catch(() => {});
      await reply(`✅ +${cleanNumber(num) || num} *UNBAN* ho gaya.`);
      break;
    }
    case 'banlist': {
      const l = bans.all();
      await reply(`🚫 *Banlist (${l.length}):*\n\n${l.map((n) => `• +${n}`).join('\n') || '(khali)'}`);
      break;
    }
    case 'delete': {
      if (!quoted) return reply('❌ Kisi message ko reply karo.');
      await sock.sendMessage(ctx.from, { delete: quoted.key });
      break;
    }
    case 'leave': {
      await reply('👋 Bot ja raha hy... Allah Hafiz!');
      setTimeout(() => {
        try { Promise.resolve(sock.groupLeave(ctx.from)).catch(() => {}); } catch { /* ignore */ }
      }, 1500);
      break;
    }
    case 'fullpp': case 'setpp': {
      const img = quoted?.message?.imageMessage || ctx.m.message.imageMessage;
      if (!img) return reply('❌ Kisi photo par reply karo ya caption me .setpp likh ke photo bhejo.');
      const buf = await downloadMedia(img, 'image');
      await sock.updateProfilePicture(sock.user.id, buf);
      await reply('✅ Profile picture update ho gayi.');
      break;
    }
    case 'status': case 'status2': {
      const img = quoted?.message?.imageMessage || ctx.m.message.imageMessage;
      const vid = quoted?.message?.videoMessage || ctx.m.message.videoMessage;
      if (img || vid) {
        const buf = await downloadMedia(img || vid, img ? 'image' : 'video');
        await sock.sendMessage('status@broadcast', img ? { image: buf, caption: ctx.arg || '' } : { video: buf, caption: ctx.arg || '' });
        await reply('✅ Status laga diya.');
      } else if (ctx.arg) {
        await sock.sendMessage('status@broadcast', { text: ctx.arg });
        await reply('✅ Text status laga diya.');
      } else reply('❌ Text likho ya media par reply karo.');
      break;
    }
    case 'getbio': {
      const num = cleanNumber(quoted ? (quoted.key.participant || quoted.key.remoteJid) : (ctx.arg || sock.user.id.split(':')[0]));
      try {
        const s = await sock.fetchStatus(num + '@s.whatsapp.net');
        await reply(`📝 *Bio (+${num}):*\n${s[0]?.status || s?.status || '-'}`);
      } catch { await reply('❌ Bio nahi mili.'); }
      break;
    }
    case 'updatebio':
      if (!ctx.arg) return reply('❌ Nayi bio likho.');
      await sock.updateProfileStatus(ctx.arg);
      await reply('✅ Bio update ho gayi.');
      break;
    case 'setname':
      if (!ctx.arg) return reply('❌ Naya naam do.');
      await sock.updateProfileName(ctx.arg);
      await reply('✅ Naam update ho gaya.');
      break;
    case 'pair': {
      const num = cleanNumber(ctx.arg);
      if (!num) return reply(`❌ Number do. Example: ${config.PREFIX}pair 923xxxxxxxxxx`);
      try {
        // Use the session manager so this links a NEW number (not the current sock).
        const bot = require('../lib/bot');
        const { normalizePhone } = require('../lib/helpers');
        const norm = normalizePhone(num, config.DEFAULT_COUNTRY_CODE || '92');
        await reply('⏳ Code ban raha hy, 2-3 second...');
        const code = await bot.requestPair(num);
        if (norm.changed) {
          await reply(`ℹ️ Number adjust kiya: *${norm.original}* ➜ *${norm.number}*`);
        }
        // Send the code ALONE so it can be copied with one tap — no label, no
        // extra text wrapped around it, and never inside a code block (some
        // clients make backtick-wrapped text hard to long-press).
        await ctx.send(ctx.from, { text: code }, { quoted: ctx.m });
        await ctx.send(ctx.from, {
          text: '📲 Ye code WhatsApp me daalo:\n*Linked Devices → Link with phone number*\n\n_Code 2 minute me expire ho jata hy — jaldi daalein._',
        });
      } catch (e) { await reply('❌ ' + (e?.message || e)); }
      break;
    }
    case 'broadcast': {
      if (!ctx.arg) return reply(`❌ Message do. Example: ${config.PREFIX}broadcast Salam sab ko!`);
      const groups = await sock.groupFetchAllParticipating();
      const jids = Object.keys(groups);
      await reply(`📢 Broadcast ${jids.length} groups ko bhej raha hoon...`);
      let n = 0;
      for (const jid of jids) {
        try {
          await sock.sendMessage(jid, { text: `📢 *${config.BOT_NAME} Broadcast*\n\n${ctx.arg}` });
          n++;
        } catch { /* skip unreachable */ }
        // small delay so we don't get rate-limited / flagged as spam
        await new Promise((r) => setTimeout(r, 1200));
      }
      await reply(`✅ Broadcast ${n}/${jids.length} groups me bhej diya.`);
      break;
    }
    case 'blocklist': {
      const bl = await sock.fetchBlocklist();
      await reply(`🚫 *Blocklist (${bl.length}):*\n\n${bl.map((j) => `• +${j.split('@')[0]}`).join('\n') || '(khali)'}`);
      break;
    }
    case 'bots': case 'activebots': case 'sessions': {
      const bot = require('../lib/bot');
      const list = bot.listSessions();
      const connected = list.filter((x) => x.status === 'connected');
      const pairing = list.filter((x) => x.status === 'pairing');
      let txt = '🤖 *Active Bots*\n\n';
      txt += `▪️ Total sessions: *${list.length}*\n`;
      txt += `▪️ Connected: *${connected.length}* 🟢\n`;
      if (pairing.length) txt += `▪️ Pairing: *${pairing.length}* 🟡\n`;
      txt += `▪️ Max allowed: *${config.MAX_SESSIONS}*\n\n`;
      if (!list.length) {
        txt += '_Koi bot linked nahi hy._';
      } else {
        txt += '*Sessions:*\n';
        list.forEach((x, i) => {
          const dot = x.status === 'connected' ? '🟢' : x.status === 'pairing' ? '🟡' : '🔴';
          txt += `${dot} *${i + 1}.* +${x.number} — ${x.status}\n`;
        });
      }
      await reply(txt);
      break;
    }
    case 'db': {
      const mongo = require('../lib/mongo');
      const sessionStore = require('../lib/sessionStore');
      const st = await mongo.status();
      let txt = '🗄️ *Database*\n\n' +
        `▪️ MongoDB: ${st.enabled ? (st.connected ? 'CONNECTED 🟢' : 'OFF 🔴') : 'not set ⚪'}\n` +
        (st.connected ? `▪️ DB: *${st.db}*\n` : '');
      if (st.connected) {
        const [cloud, keys] = await Promise.all([
          sessionStore.list().catch(() => []),
          Promise.resolve(apikeys.list().filter((x) => x.configured).length),
        ]);
        txt += `▪️ Cloud sessions: *${cloud.length}* 💾\n`;
        txt += `▪️ API keys set: *${keys}* 🔑\n`;
      }
      txt += '\n_Set MONGODB_URI to persist settings + sessions across restarts._';
      await reply(txt);
      break;
    }
    case 'restart': {
      await reply('🔄 Bot restart ho raha hy...');
      setTimeout(() => process.exit(0), 1500);
      break;
    }
    // ---- .apikey : interactive setup (numbered list -> pick -> send key) ----
    //   .apikey            -> numbered menu (1 Tiktok, 2 Instagram, 3 Song, 4 Video)
    //   .apikey <n>        -> ask for that service's key
    //   .apikey <n> <key> [endpoint] -> set it straight away
    case 'apikey': {
      return apikeyFlow.handleCommand(ctx);
    }
    // ---- .apikeys : list every stored API key (owner only) ----------------
    //   .apikeys            -> masked list (safe to screenshot)
    //   .apikeys full       -> reveal the full keys
    //   .apikeys <service>  -> details for one service
    // Keys live in MongoDB (collection `api_keys`), so they survive restarts.
    case 'apikeys': case 'keys': {
      const a = String(ctx.arg || '').trim().toLowerCase();
      const list = apikeys.list();
      const configured = list.filter((x) => x.configured);
      const mongo = require('../lib/mongo');
      const st = await mongo.status();
      const reveal = a === 'full' || a === 'show' || a === 'reveal';
      const store = st.connected ? 'MongoDB ✅' : (mongo.enabled() ? 'MongoDB (offline) ⚠️' : 'local file ⚪');

      // One service's detail view.
      if (a && !reveal) {
        const rec = list.find((x) => x.id === a);
        if (!rec) return reply(`❌ *${a}* naam ka service nahi mila.\n\nAvailable: ${apikeys.SERVICE_IDS.join(', ')}`);
        return reply(
          `${rec.emoji} *${rec.label}* API Key\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `▪️ Status: ${rec.configured ? 'SET ✅' : 'not set ⚪'}\n` +
          `▪️ Key: ${rec.configured ? apikeys.mask(rec.key) : '(not set)'}\n` +
          `▪️ Endpoint: ${rec.endpoint || '(default)'}\n` +
          (rec.updatedAt ? `▪️ Updated: ${rec.updatedAt}\n` : '') +
          `\n_Set:_ \`${config.PREFIX}setapikey ${rec.id} <key>\``
        );
      }

      let txt = '🔑 *API KEYS*\n';
      txt += `━━━━━━━━━━━━━━━━━━━━━\n`;
      txt += `▪️ Store: ${store}\n`;
      txt += `▪️ Set: *${configured.length}/${list.length}*\n`;
      txt += `━━━━━━━━━━━━━━━━━━━━━\n`;
      for (const x of list) {
        const dot = x.configured ? '🟢' : '⚪';
        const val = x.configured ? (reveal ? x.key : apikeys.mask(x.key)) : '—';
        txt += `${dot} ${x.emoji} *${x.id}* — ${val}\n`;
      }
      txt += `━━━━━━━━━━━━━━━━━━━━━\n`;
      txt += `_Setup:_ \`${config.PREFIX}apikey\` (numbered menu)\n`;
      txt += `_Update:_ \`${config.PREFIX}setapikey <service> <key>\`\n`;
      txt += `_Remove:_ \`${config.PREFIX}delapikey <service>\`\n`;
      txt += `_Reveal:_ \`${config.PREFIX}apikeys full\``;
      return reply(txt);
    }
    // ---- .setapikey : update ONE key LIVE (no server restart) -------------
    //   .setapikey <service> <key>
    //   .setapikey <service> <key> <endpoint-url>   (optional custom API base)
    case 'setapikey': case 'addapikey': {
      const parts = String(ctx.arg || '').trim().split(/\s+/).filter(Boolean);
      const service = (parts.shift() || '').toLowerCase();
      if (!service) return reply(`❌ Service do. Example: \`${config.PREFIX}setapikey tiktok <key>\``);
      const urlArg = parts.find((p) => /^https?:\/\//i.test(p));
      const key = parts.filter((p) => p !== urlArg).join(' ').trim();
      if (!key) return reply(
        `❌ *Key* missing hai — sirf URL kaafi nahi.\n\n` +
        `📌 Sahi tareeqa:\n\`${config.PREFIX}setapikey <service> <key> [endpoint]\`\n\n` +
        `Example:\n\`${config.PREFIX}setapikey ${service} YOUR_KEY https://api.example.com/ytmp3\`\n\n` +
        `_ℹ️ Key provider ki dashboard se milti hai. Endpoint = asal API path (base URL nahi)._`
      );
      apikeys.set(service, key, urlArg || undefined);
      const rec = apikeys.getService(service);
      return reply(
        `✅ *${service}* API key update ho gayi — *live* (restart ki zaroorat nahi).\n\n` +
        `🔑 Key: ${apikeys.mask(rec.key)}\n` +
        (rec.endpoint ? `🔗 Endpoint: ${rec.endpoint}\n` : '') +
        `\n_${config.PREFIX}apikeys se sab dekho._`
      );
    }
    // ---- .delapikey : remove a stored key ---------------------------------
    case 'delapikey': case 'removeapikey': {
      const service = String(ctx.arg || '').trim().toLowerCase();
      if (!service) return reply(`❌ Service do. Example: \`${config.PREFIX}delapikey tiktok\``);
      if (!apikeys.has(service)) return reply(`ℹ️ *${service}* ka koi key set nahi tha.`);
      apikeys.remove(service);
      return reply(`🗑️ *${service}* API key hata di gayi.`);
    }
    default: await reply('❓ Unknown owner command');
  }
};

module.exports = {
  commands: ['vv', 'vv2', 'vv3', 'forward', 'block', 'unblock', 'ban', 'unban', 'banlist', 'delete', 'leave', 'fullpp', 'setpp', 'status', 'status2', 'getbio', 'updatebio', 'setname', 'pair', 'broadcast', 'blocklist', 'restart', 'bots', 'activebots', 'sessions', 'db', 'apikeys', 'apikey', 'keys', 'setapikey', 'addapikey', 'delapikey', 'removeapikey'],
  category: '👑 OWNER',
  ownerOnly: true,
  handler,
  unwrapViewOnce,
};
