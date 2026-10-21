/**
 * SAQIB MD — pending "react menu" tracker
 * ---------------------------------------
 * When a user runs `.autoreact` (or `.userreact` / `.ownerreact`) with no
 * argument we show a NUMBERED menu and remember that we are waiting for their
 * pick. Their very next message that is just 1 / 2 / 3 applies the choice.
 *
 * Purely in-memory (ephemeral) — a menu only lives for a few minutes. Keyed by
 * BOTH the sender's number AND the bot's session number, so:
 *   - two people in the same chat never collide, and
 *   - when several bots share one process and sit in the SAME group, each bot
 *     only consumes the pick that was armed for ITS OWN session.
 */
const TTL = 5 * 60 * 1000; // 5 minutes to answer
const pending = new Map(); // `${senderNum}:${sessionNumber}` -> { ts }

function keyOf(senderNum, sessionNumber) {
  return `${String(senderNum || '')}:${String(sessionNumber || 'default')}`;
}

function arm(senderNum, sessionNumber) {
  pending.set(keyOf(senderNum, sessionNumber), { ts: Date.now() });
}

function peek(senderNum, sessionNumber) {
  const k = keyOf(senderNum, sessionNumber);
  const rec = pending.get(k);
  if (!rec) return null;
  if (Date.now() - rec.ts > TTL) { pending.delete(k); return null; }
  return rec;
}

/**
 * If THIS session has an armed menu for the sender AND `text` is exactly 1/2/3,
 * consume it and return { pick }. Otherwise return null (and leave the menu
 * armed so a later numeric reply still works).
 */
function consume(senderNum, sessionNumber, text) {
  const rec = peek(senderNum, sessionNumber);
  if (!rec) return null;
  const t = String(text || '').trim();
  if (!/^[123]$/.test(t)) return null;
  pending.delete(keyOf(senderNum, sessionNumber));
  return { pick: Number(t) };
}

function clear(senderNum, sessionNumber) { pending.delete(keyOf(senderNum, sessionNumber)); }

module.exports = { arm, peek, consume, clear, TTL };
