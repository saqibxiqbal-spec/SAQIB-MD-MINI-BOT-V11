/**
 * SAQIB MD — interactive replies
 * ------------------------------
 * Lets a command ask a question and then act on the user's NEXT message
 * (e.g. `.wyr` → the user replies "1"/"2" and the bot answers).
 *
 * A pending interaction is stored per (chat, sender) with a TTL, so it never
 * leaks between users or chats. `handle(ctx)` is called by the dispatcher for
 * every plain (non-command) message and returns true if it consumed the message.
 */
const TTL = 5 * 60 * 1000; // 5 minutes to answer
const pending = new Map(); // `${chatId}|${sender}` -> { type, data, expires }

const key = (chatId, sender) => `${chatId}|${sender}`;

function set(chatId, sender, type, data, ttl = TTL) {
  pending.set(key(chatId, sender), { type, data, expires: Date.now() + ttl });
}

function get(chatId, sender) {
  const k = key(chatId, sender);
  const v = pending.get(k);
  if (!v) return null;
  if (Date.now() > v.expires) { pending.delete(k); return null; }
  return v;
}

function clear(chatId, sender) { pending.delete(key(chatId, sender)); }

/**
 * Resolve a plain-text reply against a pending interaction.
 * Returns true if the message was consumed (so the dispatcher stops).
 */
async function handle(ctx) {
  const inter = get(ctx.from, ctx.sender);
  if (!inter) return false;

  const raw = String(ctx.text || '').trim();

  if (inter.type === 'choice') {
    const opts = inter.data?.options || [];
    const m = raw.match(/^([0-9]+)/);
    const n = m ? parseInt(m[1], 10) : NaN;
    if (n >= 1 && n <= opts.length) {
      clear(ctx.from, ctx.sender);
      const chosen = opts[n - 1];
      // An option may either produce text (`result`) or run a side-effect
      // (`run`) — e.g. downloading audio vs video for `.song`.
      if (typeof chosen.run === 'function') {
        await chosen.run(ctx).catch(() => {});
      } else {
        const out = typeof chosen.result === 'function' ? chosen.result() : String(chosen.result);
        await ctx.reply(out).catch(() => {});
      }
      return true;
    }
    // A pure number that's out of range → re-prompt, keep the interaction open.
    if (/^[0-9]+$/.test(raw)) {
      await ctx.reply(`❌ *1* se *${opts.length}* ke darmiyan number chuno.`).catch(() => {});
      return true;
    }
    // Any other message cancels the interaction and falls through to normal handling.
    clear(ctx.from, ctx.sender);
    return false;
  }

  // Generic prompt: the caller supplies `data.handler(ctx, raw)` and decides
  // whether the message was consumed (returns true) or should fall through.
  // Used by the interactive `.apikey` flow (pick a number, then send the key).
  if (inter.type === 'custom') {
    const h = inter.data && inter.data.handler;
    if (typeof h === 'function') {
      const consumed = await h(ctx, raw).catch(() => false);
      if (consumed) return true;
    }
    clear(ctx.from, ctx.sender);
    return false;
  }

  // Unknown interaction type — drop it so it can't get stuck.
  clear(ctx.from, ctx.sender);
  return false;
}

// Housekeeping so expired entries don't pile up.
const _t = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) if (now > v.expires) pending.delete(k);
}, 60 * 1000);
if (_t.unref) _t.unref();

module.exports = { set, get, clear, handle };
