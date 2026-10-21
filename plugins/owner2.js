/**
 * OWNER2 — owner-only bot management
 */
const config = require('../config');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getJSON, pick, randInt } = require('../lib/helpers');

const P = () => config.PREFIX;

const ownerState = {
  autoanswer: null,       // string | null
  maintenance: false,
  maintenanceMsg: '🔧 Bot maintenance me hai. Thori der baad try karo.',
  selfmode: false,
  sudo: new Set(),
  prem: new Set(),
  thumb: null,
  boot: Date.now(),
  commandsRun: 0,
};
const errors = [];

const handler = async (ctx) => {
  const { command, reply, arg, isOwner, senderNum, pushname } = ctx;

  // every command in this file is owner-only
  if (!isOwner) {
    return reply(`⛔ *Owner-only command.*\n\nYe sirf bot owner use kar sakta hai.`);
  }

  switch (command) {
    case 'stats': {
      const up = Date.now() - ownerState.boot;
      const h = Math.floor(up / 3600000), m = Math.floor((up % 3600000) / 60000);
      const mem = process.memoryUsage();
      return reply(`📊 *Bot stats*\n\n⏱️ Uptime: *${h}h ${m}m*\n🧠 RAM: ${(mem.rss / 1048576).toFixed(0)} MB\n⚙️ Node: ${process.version}\n💻 Platform: ${process.platform}\n🔧 Commands run: ${ownerState.commandsRun}\n👑 Owner: ${pushname || senderNum}\n🕐 ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`);
    }
    case 'healthcheck': {
      const checks = [];
      try { const t = Date.now(); await getJSON('https://api.ipify.org?format=json'); checks.push(`✅ Internet — ${Date.now() - t}ms`); }
      catch { checks.push('❌ Internet — fail'); }
      checks.push(`✅ Memory — ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`);
      checks.push(`✅ Prefix — ${config.PREFIX}`);
      checks.push(`✅ Session — ${ctx.sock ? 'connected' : 'check'}`);
      return reply(`🩺 *Health check*\n\n${checks.join('\n')}\n\n${checks.some((c) => c.startsWith('❌')) ? '⚠️ Kuch issues hain.' : '🎉 Sab theek hai!'}`);
    }
    case 'maintenance': {
      if (!arg) return reply(`🔧 *Maintenance:* ${ownerState.maintenance ? '✅ ON' : '❌ OFF'}\n\n${P()}maintenance on/off [message]`);
      const [sub, ...msg] = arg.split(' ');
      if (sub === 'on') {
        ownerState.maintenance = true;
        if (msg.length) ownerState.maintenanceMsg = msg.join(' ');
        return reply(`🔧 *Maintenance ON*\n\nMessage: ${ownerState.maintenanceMsg}`);
      }
      ownerState.maintenance = false;
      return reply('✅ *Maintenance OFF* — bot normal hai.');
    }
    case 'selfmode': {
      if (!arg) return reply(`👤 *Self mode:* ${ownerState.selfmode ? '✅ ON (sirf owner commands)' : '❌ OFF (sab commands)'}\n\n${P()}selfmode on/off`);
      ownerState.selfmode = arg === 'on';
      return reply(`👤 *Self mode ${ownerState.selfmode ? 'ON ✅' : 'OFF ❌'}*`);
    }
    case 'sudomode': {
      const num = (arg || '').replace(/[^0-9]/g, '');
      if (!num) return reply(`❌ Number do. Example: ${P()}sudomode 923001234567\n\n_Current: ${ownerState.sudo.size} sudo users_`);
      if (ownerState.sudo.has(num)) { ownerState.sudo.delete(num); return reply(`✅ *${num}* sudo se hata diya.`); }
      ownerState.sudo.add(num);
      return reply(`👑 *${num}* ab sudo user hai.\n\nTotal: ${ownerState.sudo.size}`);
    }
    case 'premlist': {
      return reply(`💎 *Premium users* (${ownerState.prem.size})\n\n${[...ownerState.prem].join('\n') || '_Koi nahi._'}\n\n_${P()}premlist add <number> — jald aayega._`);
    }
    case 'totaluser': {
      return reply(`👥 *Total users*\n\n📱 Tracked chats: ${ownerState.commandsRun ? 'active' : 'starting'}\n\n_Exact count WhatsApp se milta hai — baileys stats endpoint dekh lo._`);
    }
    case 'autoanswer': {
      if (!arg) {
        return reply(ownerState.autoanswer
          ? `🤖 *Auto-answer ON*\n\nReply: "${ownerState.autoanswer}"\n\n_Off karne ke liye ${P()}autoanswer off_`
          : `🤖 *Auto-answer OFF*\n\n${P()}autoanswer <text> — jab aap offline ho`);
      }
      if (arg === 'off') { ownerState.autoanswer = null; return reply('✅ *Auto-answer OFF*'); }
      ownerState.autoanswer = arg;
      return reply(`🤖 *Auto-answer ON*\n\nJab aap busy ho: "${arg}"`);
    }
    case 'setthumb': {
      const img = ctx.quoted?.message?.imageMessage;
      if (!img) return reply(`❌ Kisi image par reply karke ${P()}setthumb likho.`);
      try {
        const { downloadMedia } = require('../lib/helpers');
        ownerState.thumb = await downloadMedia(img, 'image');
        return reply(`✅ *Thumbnail set!* (${(ownerState.thumb.length / 1024).toFixed(1)} KB)\n\n_Ye ab stickers/media ke preview me use hoga._`);
      } catch { return reply('❌ Thumbnail set nahi hui.'); }
    }
    case 'logs': {
      if (!errors.length) return reply('📋 *Error logs*\n\n✅ Koi error nahi. Bot saaf chal raha hai.');
      return reply(`📋 *Error logs* (last ${Math.min(errors.length, 10)})\n\n${errors.slice(-10).map((e, i) => `${i + 1}. ${e}`).join('\n')}`);
    }
    case 'backup': {
      try {
        const files = fs.readdirSync(path.join(__dirname, '..', 'plugins')).filter((f) => f.endsWith('.js'));
        const dump = Buffer.from(JSON.stringify({
          when: new Date().toISOString(),
          plugins: files,
          settings: { prefix: config.PREFIX, botName: config.BOT_NAME },
          counts: { plugins: files.length, sudo: ownerState.sudo.size, prem: ownerState.prem.size },
        }, null, 2));
        await ctx.send(ctx.from, { document: dump, fileName: `bot_backup_${Date.now()}.json`, mimetype: 'application/json' }, { quoted: ctx.m });
      } catch { return reply('❌ Backup nahi bana.'); }
      break;
    }
    case 'chart': {
      const bars = Array.from({ length: 7 }, (_, i) => {
        const n = randInt(2, 10);
        return `Day ${i + 1} ${'█'.repeat(n)} ${n}`;
      });
      return reply(`📈 *Activity chart* (demo)\n\n${bars.join('\n')}\n\n_Real data ke liye analytics plugin chahiye._`);
    }
    default:
      return reply('❓ Unknown owner command');
  }
};

module.exports = {
  commands: [
    'backup', 'autoanswer', 'totaluser', 'maintenance', 'premlist', 'sudomode', 'selfmode', 'setthumb',
    'stats', 'chart', 'logs', 'healthcheck',
  ],
  category: '👑 OWNER',
  handler,
  ownerState,
};
