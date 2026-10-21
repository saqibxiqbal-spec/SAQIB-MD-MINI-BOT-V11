/**
 * SELF-HEAL — `.heel` / `.heal` / `.update` / `.refresh`
 * ------------------------------------------------------
 * `.heel`  : the self-heal console. It gathers every command error the bot has
 *            caught (lib/selfheal) plus the raw error events from the debug ring
 *            buffer, re-runs the safe automatic fixes, and hands the owner a
 *            ready-to-act report (command, message, a few stack frames, count,
 *            who/where it happened). This is the "connected to the assistant"
 *            part: the owner forwards this and the fix can be made without the
 *            user having to explain anything.
 *            `.heel fix`   -> force the safe auto-fixes to run again.
 *            `.heel clear` -> wipe the tracked error log.
 *
 * `.update` / `.refresh` : a REAL system refresh (lib/system.js). It drops every
 *            plugin from Node's require cache, re-reads them from disk, rebuilds
 *            the command registry, resets the typo index + group-metadata cache
 *            and clears the AI cache. The reply reports what ACTUALLY changed
 *            (plugin count, command count, elapsed ms) — it is not a fake
 *            "refreshed!" toast.
 */
const config = require('../config');
const selfheal = require('../lib/selfheal');
const debug = require('../lib/debug');

/** Human "2m ago" style relative time. */
function ago(t) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Build the copy-pasteable self-heal report. */
function buildReport() {
  const tracked = selfheal.stats();                 // deduped command errors
  const raw = debug.recent(200).filter((e) => e.type === 'error');
  const lines = [];
  lines.push('🩺 *SELF-HEAL REPORT*');
  lines.push(`🕒 ${new Date().toISOString()}`);
  lines.push('');

  if (!tracked.length && !raw.length) {
    lines.push('✅ Koi error record nahi hy — sab theek chal raha hy.');
    return { text: lines.join('\n'), count: 0 };
  }

  if (tracked.length) {
    lines.push(`🐞 *Tracked command errors:* ${tracked.length}`);
    tracked.slice(0, 8).forEach((e, i) => {
      lines.push('');
      lines.push(`*${i + 1}) ${e.command || '?'}*  ×${e.count}`);
      lines.push(`   ❗ ${String(e.msg || '').slice(0, 220)}`);
      if (e.stack) lines.push('   ```' + String(e.stack).split('\n').slice(0, 3).join('\n') + '```');
      lines.push(`   ⏱️ pehla ${ago(e.firstAt)} · aakhri ${ago(e.lastAt)}`);
    });
  }

  if (raw.length) {
    lines.push('');
    lines.push(`📜 *Recent error events:* ${raw.length}`);
    raw.slice(-5).forEach((e) => {
      const d = e.data || {};
      lines.push(`▸ ${ago(e.t)} · ${d.msg || ''} ${d.error ? '— ' + String(d.error).slice(0, 120) : ''}`);
    });
  }
  return { text: lines.join('\n'), count: tracked.length + raw.length };
}

const handler = async (ctx) => {
  const { command, reply, arg } = ctx;
  const sub = String(arg || '').trim().toLowerCase();

  switch (command) {
    case 'heel':
    case 'heal': {
      if (sub === 'clear') {
        selfheal.reset();
        debug.clear();
        return reply('🧹 Self-heal log saaf kar diya.');
      }

      // Run the safe automatic fixes first (this is what "fix it yourself" means).
      let fixedNote = '';
      if (sub === 'fix') {
        try {
          const h = require('../lib/handler');
          if (typeof h.clearGroupMetaCache === 'function') h.clearGroupMetaCache();
          const s = require('../lib/settings');
          if (typeof s.load === 'function') s.load();
          fixedNote = '\n\n✅ Safe auto-fixes dobara chala diye (group cache + settings reload).';
        } catch { /* ignore */ }
      }

      const { text, count } = buildReport();
      await reply(text + fixedNote);

      // Also forward the report to the owner number so it reaches the assistant
      // even if this was triggered from a group or another device.
      try {
        const ownerNum = config.OWNER_NUMBER;
        const sock = ctx.sock;
        if (ownerNum && sock && !ctx.m?.key?.fromMe) {
          await sock.sendMessage(`${ownerNum}@s.whatsapp.net`, { text: '📨 *Forwarded self-heal report*\n\n' + text });
        }
      } catch { /* ignore */ }
      return;
    }

    case 'update':
    case 'refresh': {
      // REAL refresh — no fake "refreshed!" message. We run it, then report the
      // numbers that actually changed.
      let res;
      try {
        res = require('../lib/system').refresh();
      } catch (e) {
        return reply(`❌ Refresh fail: ${e?.message || e}`);
      }
      const lines = [
        '♻️ *System refreshed (real)*',
        '',
        `📦 Plugins reloaded: *${res.files}*`,
        `⌨️ Commands: *${res.commands}*`,
        `⏱️ Time: *${res.ms}ms*`,
      ];
      if (res.failed && res.failed.length) lines.push(`⚠️ Failed: ${res.failed.join(', ')}`);
      else lines.push('✅ Sab plugins theek load ho gaye.');
      await reply(lines.join('\n'));
      return;
    }

    default:
      await reply('❓ Unknown system command');
  }
};

module.exports = {
  commands: ['heel', 'heal', 'update', 'refresh'],
  category: '🩺 SYSTEM',
  ownerOnly: true,
  handler,
};
