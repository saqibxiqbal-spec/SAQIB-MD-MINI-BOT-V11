/**
 * SAQIB MD — pending "menu" reply tracker
 * ---------------------------------------
 * When `.menu` shows the numbered CATEGORY list, we remember it for the sender
 * and wait for their next message. If that message is just a NUMBER (1, 2, 3…)
 * we open THAT category's menu — so the user never has to type `.menu ai`,
 * they can simply reply `1`. Works for EVERY number in the list.
 *
 * Keyed by BOTH the sender's number AND the bot's session number, so:
 *   - two people in the same chat never collide, and
 *   - when several bots share one process and sit in the SAME group, each bot
 *     only consumes the pick that was armed for ITS OWN session.
 *
 * Purely in-memory (ephemeral): a menu only lives for a few minutes.
 */
const TTL = 5 * 60 * 1000; // 5 minutes to answer
const pending = new Map(); // `${senderNum}:${sessionNumber}` -> { cats: [...], ts }

function keyOf(senderNum, sessionNumber) {
  return `${String(senderNum || '')}:${String(sessionNumber || 'default')}`;
}

/** Remember the ordered category list shown to this sender for this session. */
function arm(senderNum, sessionNumber, cats) {
  if (!Array.isArray(cats) || !cats.length) return;
  pending.set(keyOf(senderNum, sessionNumber), { cats: cats.slice(), ts: Date.now() });
}

function peek(senderNum, sessionNumber) {
  const k = keyOf(senderNum, sessionNumber);
  const rec = pending.get(k);
  if (!rec) return null;
  if (Date.now() - rec.ts > TTL) { pending.delete(k); return null; }
  return rec;
}

/**
 * If THIS session has an armed menu for the sender AND `text` is a bare number,
 * consume it and return { index, cat } (or { invalid, max } when out of range).
 * Otherwise return null (and leave the menu armed so a later number still works).
 */
function consume(senderNum, sessionNumber, text) {
  const rec = peek(senderNum, sessionNumber);
  if (!rec) return null;
  const t = String(text || '').trim();
  const m = t.match(/^(\d{1,3})$/);
  if (!m) return null; // not a bare number → keep waiting
  const n = parseInt(m[1], 10);
  pending.delete(keyOf(senderNum, sessionNumber));
  if (n < 1 || n > rec.cats.length) return { invalid: true, max: rec.cats.length };
  return { index: n, cat: rec.cats[n - 1] };
}

function clear(senderNum, sessionNumber) {
  pending.delete(keyOf(senderNum, sessionNumber));
}

module.exports = { arm, peek, consume, clear, TTL };
