/**
 * GROUP — group management (admin commands)
 */
const config = require('../config');
const { isGroupAdmin } = require('../lib/handler');
const { downloadMedia } = require('../lib/helpers');
const { generateWAMessageFromContent, jidNormalizedUser, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

const warns = new Map(); // jid -> Map(user -> count)

/**
 * Post a WhatsApp *group status* (group story). Baileys has no high-level helper,
 * so we build the raw protocol message (groupStatusMessageV2 + isGroupStatus).
 * Falls back to a normal message if the payload is rejected by the server.
 */
async function sendGroupStatus(sock, groupJid, { text = '', mediaBuffer = null, mime = '' } = {}) {
  const senderJid = jidNormalizedUser(sock.user?.id);
  const contextInfo = {
    forwardingScore: 0,
    featureEligibilities: { canBeReshared: true, canReceiveMultiReact: true },
    pairedMediaType: 0,
    statusSourceType: 4,
    statusAttributions: [{ type: 10 }],
    isGroupStatus: true,
    statusAudienceMetadata: { audienceType: 1, listEmoji: '\ud83d\udccc', listName: config.BOT_NAME },
  };
  if (mediaBuffer) {
    let mediaInput; let messageKey;
    if (mime.startsWith('audio') || mime.includes('ogg') || mime.includes('opus')) {
      mediaInput = { audio: mediaBuffer, mimetype: 'audio/ogg; codecs=opus', ptt: true }; messageKey = 'audioMessage';
    } else if (mime.startsWith('video') || mime.includes('mp4')) {
      mediaInput = { video: mediaBuffer, mimetype: 'video/mp4', caption: text }; messageKey = 'videoMessage';
    } else {
      mediaInput = { image: mediaBuffer, mimetype: mime || 'image/jpeg', caption: text }; messageKey = 'imageMessage';
    }
    const prepared = await prepareWAMessageMedia(mediaInput, { upload: sock.waUploadToServer });
    prepared[messageKey].contextInfo = contextInfo;
    await sock.sendMessage(groupJid, prepared);
    return;
  }
  const innerContent = {
    extendedTextMessage: {
      text: text || 'Group Story',
      font: 1,
      backgroundArgb: (0xFF23313A >>> 0),
      contextInfo: {
        forwardingScore: 0,
        featureEligibilities: { canBeReshared: true, canReceiveMultiReact: true },
        pairedMediaType: 0,
        isGroupStatus: true,
        statusAttributions: [{ type: 6, groupStatus: { authorJid: senderJid } }],
      },
    },
  };
  const messageContent = { groupStatusMessageV2: { message: innerContent } };
  const generated = generateWAMessageFromContent(groupJid, messageContent, { userJid: senderJid });
  await sock.relayMessage(groupJid, generated.message, { messageId: generated.key.id });
}

const handler = async (ctx) => {
  const { sock, command, reply, from, arg, quoted } = ctx;

  // commands that require group admin
  const needAdmin = ['kick', 'promote', 'demote', 'mute', 'unmute', 'tagall', 'everyone', 'add', 'revoke',
    'updategcname', 'updategcdesc', 'link', 'invite', 'del', 'hidetag', 'poll', 'warn', 'resetwarn',
    'acceptall', 'rejectall', 'requests', 'accept', 'reject'];
  if (needAdmin.includes(command) && !ctx.isOwner) {
    // ctx.isAdmin is resolved (LID-aware) once in the central handler; fall back
    // to a direct check only if it is somehow missing. The owner is always allowed.
    const admin = ctx.isAdmin ?? await isGroupAdmin(sock, from, ctx.sender).catch(() => false);
    if (!admin) return reply('\u274c Ye command sirf *group admins* ke liye hai.');
  }

  const target = quoted ? (quoted.key.participant || quoted.key.remoteJid) : (arg ? arg.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);

  switch (command) {
    case 'tagall': case 'everyone': {
      const meta = await sock.groupMetadata(from);
      const txt = arg ? `\ud83d\udce2 *${arg}*\n\n` : '\ud83d\udce2 *Attention Everyone*\n\n';
      const mentions = meta.participants.map((p) => p.id);
      await ctx.send(from, { text: txt + mentions.map((m, i) => `${i + 1}. @${m.split('@')[0]}`).join('\n'), mentions }, { quoted: ctx.m });
      break;
    }
    case 'tag': case 'hidetag': {
      const meta = await sock.groupMetadata(from);
      const mentions = meta.participants.map((p) => p.id);
      await ctx.send(from, { text: arg || '\ud83d\udce2', mentions }, { quoted: ctx.m });
      break;
    }
    case 'kick': {
      if (!target) return reply('\u274c Kisi member ko reply karo ya number do.');
      await sock.groupParticipantsUpdate(from, [target], 'remove');
      await reply(`\ud83d\udc62 @${target.split('@')[0]} ko nikal diya gaya.`, { mentions: [target] });
      break;
    }
    case 'promote': {
      if (!target) return reply('\u274c Kisi member ko reply karo ya number do.');
      await sock.groupParticipantsUpdate(from, [target], 'promote');
      await reply(`\ud83d\udc51 @${target.split('@')[0]} ab *ADMIN* hy!`, { mentions: [target] });
      break;
    }
    case 'demote': {
      if (!target) return reply('\u274c Kisi member ko reply karo ya number do.');
      await sock.groupParticipantsUpdate(from, [target], 'demote');
      await reply(`\u2b07\ufe0f @${target.split('@')[0]} ab normal member hy.`, { mentions: [target] });
      break;
    }
    case 'mute': case 'unmute': {
      await sock.groupSettingUpdate(from, command === 'mute' ? 'announcement' : 'not_announcement');
      await reply(command === 'mute' ? '\ud83d\udd07 Group *sirf admins* ke messages ke liye.' : '\ud83d\udd0a Sab members message kar sakte hain.');
      break;
    }
    case 'link': case 'invite': {
      const code = await sock.groupInviteCode(from);
      await reply(`\ud83d\udd17 *Group Link:*\nhttps://chat.whatsapp.com/${code}`);
      break;
    }
    case 'revoke': {
      await sock.groupRevokeInvite(from);
      await reply('\u267b\ufe0f Purana link khatam, naya link ban gaya.');
      break;
    }
    case 'ginfo': case 'gcstatus': case 'gcstatus2': {
      const meta = await sock.groupMetadata(from);
      const admins = meta.participants.filter((p) => p.admin);
      const base = `\ud83d\udc65 *${meta.subject}*\n\n\ud83c\udd94 ID: ${meta.id}\n\ud83d\udd39 Members: ${meta.participants.length}\n\ud83d\udc51 Admins: ${admins.length}\n\ud83d\udd39 Created: ${new Date(meta.creation * 1000).toLocaleDateString()}\n\ud83d\udd39 Owner: @${(meta.owner || '').split('@')[0]}\n\ud83d\udd39 Description: ${meta.desc || '-'}`;
      const extra = command === 'gcstatus2'
        ? `\n\ud83d\udd12 Announce: ${meta.announce ? 'ON' : 'OFF'}\n\ud83d\udeaa Locked: ${meta.restrict ? 'ON' : 'OFF'}`
        : '';
      await reply(base + extra, { mentions: meta.owner ? [meta.owner] : [] });
      break;
    }
    case 'groupstatus': case 'gcstatuspost': case 'togcstatus': {
      const img = quoted?.message?.imageMessage || ctx.m?.message?.imageMessage;
      const vid = quoted?.message?.videoMessage || ctx.m?.message?.videoMessage;
      if (!arg && !img && !vid) return reply(`\u274c Text do ya media par reply karo.\nExample: ${config.PREFIX}groupstatus Salam sab ko!`);
      try {
        if (img || vid) {
          const buf = await downloadMedia(img || vid, img ? 'image' : 'video');
          await sendGroupStatus(sock, from, { text: arg || '', mediaBuffer: buf, mime: img ? 'image/jpeg' : 'video/mp4' });
        } else {
          await sendGroupStatus(sock, from, { text: arg });
        }
        await reply('\u2705 Group status (story) laga diya.');
      } catch (e) {
        // Fallback: at least deliver it as a normal group message.
        await ctx.send(from, { text: `\ud83d\udccc ${arg || ''}`.trim() }).catch(() => {});
        await reply('\u26a0\ufe0f Group-status API fail \u2014 normal message bhej diya.');
      }
      break;
    }
    case 'updategcname':
      if (!arg) return reply('\u274c Naya naam do.');
      await sock.groupUpdateSubject(from, arg);
      await reply('\u2705 Group name update ho gaya.');
      break;
    case 'updategcdesc':
      if (!arg) return reply('\u274c Nayi description do.');
      await sock.groupUpdateDescription(from, arg);
      await reply('\u2705 Description update ho gayi.');
      break;
    case 'poll': {
      if (!arg.includes(',')) return reply(`\u274c Format: ${config.PREFIX}poll sawal?, option1, option2`);
      const [q, ...opts] = arg.split(',').map((s) => s.trim());
      await ctx.send(from, { poll: { name: q, values: opts, selectableCount: 1 } }, { quoted: ctx.m });
      break;
    }
    case 'del':
      if (!quoted) return reply('\u274c Kisi message ko reply karo.');
      await sock.sendMessage(from, { delete: quoted.key });
      break;
    case 'add': {
      const num = arg.replace(/[^0-9]/g, '');
      if (!num) return reply('\u274c Number do.');
      await sock.groupParticipantsUpdate(from, [num + '@s.whatsapp.net'], 'add');
      await reply(`\u2705 +${num} ko group me add kar diya.`);
      break;
    }
    case 'warn': {
      if (!target) return reply('\u274c Kisi member ko reply karo ya number do.');
      const g = warns.get(from) || new Map();
      const c = (g.get(target) || 0) + 1;
      g.set(target, c);
      warns.set(from, g);
      await reply(`\u26a0\ufe0f @${target.split('@')[0]} ko warning *${c}/3*.\n${c >= 3 ? '\ud83d\udeab 3 warnings \u2014 admin kick kar sakta hy!' : ''}`, { mentions: [target] });
      break;
    }
    case 'resetwarn': {
      if (!target) return reply('\u274c Kisi member ko reply karo ya number do.');
      const g = warns.get(from) || new Map();
      g.set(target, 0);
      warns.set(from, g);
      await reply(`\u2705 @${target.split('@')[0]} ki warnings reset ho gayi.`, { mentions: [target] });
      break;
    }
    case 'warnings': {
      const g = warns.get(from) || new Map();
      const t = target || ctx.sender;
      await reply(`\u26a0\ufe0f @${t.split('@')[0]} ki warnings: *${g.get(t) || 0}/3*`, { mentions: [t] });
      break;
    }
    case 'listadmins': {
      const meta = await sock.groupMetadata(from);
      const admins = meta.participants.filter((p) => p.admin);
      await reply(`\ud83d\udc51 *Admins (${admins.length}):*\n\n${admins.map((a) => `\u2022 @${a.id.split('@')[0]}`).join('\n')}`, { mentions: admins.map((a) => a.id) });
      break;
    }
    case 'gcpp': {
      const a = ctx.senderNum;
      const b = quoted ? (quoted.key.participant || '').split('@')[0].split(':')[0] : (arg ? arg.replace(/[^0-9]/g, '') : null);
      if (!b) return reply('\u274c Kisi member ko reply karo ya number do.');
      const seed = [a, b].sort().join('');
      let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 1000;
      const pct = h % 101;
      const bar = '\u2588'.repeat(Math.round(pct / 10)).padEnd(10, '\u2591');
      await reply(`\ud83d\udc98 *Group Couple*\n\n+${a} \u2764\ufe0f +${b}\n${bar} *${pct}%*`);
      break;
    }
    case 'out': case 'end': {
      await reply('\ud83d\udc4b Theek hy, main group chhor raha hoon. Allah Hafiz!');
      await sock.groupLeave(from).catch(() => {});
      break;
    }
    case 'newgc': {
      const [name, ...nums] = arg.split('|').map((s) => s.trim());
      if (!name) return reply(`\u274c Format: ${config.PREFIX}newgc Group Name | 923001234567, 923009876543`);
      const participants = (nums.join(',').match(/\d{8,15}/g) || []).map((n) => n + '@s.whatsapp.net');
      try {
        const g = await sock.groupCreate(name, participants);
        await reply(`\u2705 Group bana: *${name}*\n\ud83c\udd94 ${g.id}`);
      } catch { await reply('\u274c Group banane me error aaya.'); }
      break;
    }
    case 'join': {
      const link = (arg || '').match(/chat\.whatsapp\.com\/([\w-]+)/i);
      if (!link) return reply(`\u274c Invite link do. Example: ${config.PREFIX}join https://chat.whatsapp.com/XXXX`);
      try {
        await sock.groupAcceptInvite(link[1]);
        await reply('\u2705 Group join kar liya!');
      } catch { await reply('\u274c Join fail (link invalid ya expire).'); }
      break;
    }
    case 'requests': {
      try {
        const list = await sock.groupRequestParticipantsList(from);
        if (!list?.length) return reply('\ud83d\udced Koi pending join request nahi hy.');
        await reply(`\ud83d\udced *Pending Requests (${list.length}):*\n\n${list.map((r) => `\u2022 +${(r.jid || r).split('@')[0]}`).join('\n')}\n\n_Approve: ${config.PREFIX}acceptall  |  Reject: ${config.PREFIX}rejectall_`);
      } catch { await reply('\u274c Requests list fail.'); }
      break;
    }
    case 'acceptall': case 'rejectall': {
      try {
        const list = await sock.groupRequestParticipantsList(from);
        if (!list?.length) return reply('\ud83d\udced Koi pending join request nahi hy.');
        const ids = list.map((r) => r.jid || r);
        const action = command === 'acceptall' ? 'approve' : 'reject';
        await sock.groupRequestParticipantsUpdate(from, ids, action);
        await reply(`\u2705 ${ids.length} request${ids.length > 1 ? 's' : ''} ${action === 'approve' ? 'accept' : 'reject'} kar di${ids.length > 1 ? 'n' : ''}.`);
      } catch { await reply('\u274c Action fail.'); }
      break;
    }
    case 'accept': case 'reject': {
      if (!target) return reply('\u274c Number do ya member ko reply karo.');
      try {
        await sock.groupRequestParticipantsUpdate(from, [target], command === 'accept' ? 'approve' : 'reject');
        await reply(`\u2705 +${target.split('@')[0]} ${command === 'accept' ? 'accept' : 'reject'} kar diya.`);
      } catch { await reply('\u274c Action fail.'); }
      break;
    }
    case 'chreact': case 'chreact2': {
      if (!quoted) return reply('\u274c Kisi message par reply karo.');
      const emoji = arg || '\ud83d\udd25';
      await ctx.send(from, { react: { text: emoji, key: quoted.key } });
      break;
    }
    default: await reply('\u2753 Unknown group command');
  }
};

module.exports = {
  commands: [
    'tagall', 'everyone', 'tag', 'hidetag', 'kick', 'promote', 'demote', 'mute', 'unmute', 'link', 'invite',
    'revoke', 'ginfo', 'gcstatus', 'gcstatus2', 'groupstatus', 'gcstatuspost', 'togcstatus', 'updategcname', 'updategcdesc', 'poll', 'del', 'add', 'warn',
    'resetwarn', 'warnings', 'listadmins', 'gcpp', 'out', 'end', 'newgc', 'join', 'requests', 'acceptall',
    'rejectall', 'accept', 'reject', 'chreact', 'chreact2',
  ],
  category: '\ud83d\udc65 GROUP',
  groupOnly: true,
  handler,
};
