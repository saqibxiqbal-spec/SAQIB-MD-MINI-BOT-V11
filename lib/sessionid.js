/**
 * SAQIB MD — SESSION_ID restore
 * ---------------------------------------------------------------------------
 * Some hosts wipe the container filesystem on every restart (ephemeral-disk hosts,
 * many free tiers). That would normally mean every linked WhatsApp number has
 * to be re-paired after each restart.
 *
 * To fix that, put a base64 backup of the `session/` folder into the SESSION_ID
 * env var. On boot, if the session folder is empty, we decode + restore it so
 * every linked number reconnects automatically.
 *
 * Accepted SESSION_ID formats (auto-detected):
 *   1. base64 of a .zip      (recommended)  -> extracted into SESSION_DIR
 *   2. base64 of a .tar.gz                  -> extracted via the system `tar`
 *   3. raw JSON (a creds.json)              -> written to SESSION_DIR/<number>/
 *
 * The ZIP reader is dependency-free (Node's built-in zlib only).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const config = require('../config');

function decode(id) {
  return Buffer.from(String(id).replace(/\s+/g, ''), 'base64');
}
function isZip(buf) { return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; }
function isGzip(buf) { return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b; }

/** Minimal central-directory ZIP extractor (stored + deflate). No deps. */
function unzip(buf, destRoot) {
  let eocd = -1;
  const minStart = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= minStart; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip (no EOCD)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const root = path.resolve(destRoot);
  let written = 0;
  for (let n = 0; n < count; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    off += 46 + nameLen + extraLen + commentLen;

    const rel = name.split('\\').join('/');
    if (rel.endsWith('/')) continue; // directory entry
    if (localOff + 30 > buf.length) continue;
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    let out;
    if (method === 0) out = data;
    else if (method === 8) out = zlib.inflateRawSync(data);
    else continue; // unsupported compression — skip
    const dest = path.join(root, rel);
    if (!path.resolve(dest).startsWith(root)) continue; // block path traversal
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, out);
    written += 1;
  }
  return written;
}

/** If everything landed under one NON-numeric wrapper folder (e.g. "session/"),
 *  move it up a level so the multi-session layout (SESSION_DIR/<number>) holds.
 *  A single numeric folder (e.g. "923001234567/") is already correct — keep it. */
function flatten(base) {
  let entries;
  try { entries = fs.readdirSync(base).filter((d) => !d.startsWith('.')); } catch { return; }
  if (entries.length !== 1) return;
  const name = entries[0];
  if (/^[0-9]{8,15}$/.test(name)) return; // already a session folder — don't touch
  const only = path.join(base, name);
  try {
    if (!fs.statSync(only).isDirectory()) return;
    for (const f of fs.readdirSync(only)) fs.renameSync(path.join(only, f), path.join(base, f));
    fs.rmdirSync(only);
  } catch { /* ignore */ }
}

/**
 * Restore sessions from SESSION_ID. Only runs when the disk has NO numeric
 * session folders yet (a fresh container) so it never clobbers live data.
 * @returns {number} how many files/entries were restored (0 = nothing done)
 */
function restoreFromSessionId() {
  const id = String(config.SESSION_ID || '').trim();
  if (!id) return 0;
  const base = path.resolve(config.SESSION_DIR);

  let existing = [];
  try { existing = fs.readdirSync(base).filter((d) => /^[0-9]{8,15}$/.test(d)); } catch { existing = []; }
  if (existing.length) { console.log('[SESSION_ID] disk already has sessions — skipping restore'); return 0; }

  let buf;
  try { buf = decode(id); } catch (e) { console.log('[SESSION_ID] decode failed:', e?.message || e); return 0; }
  if (!buf || !buf.length) return 0;
  fs.mkdirSync(base, { recursive: true });

  try {
    if (isZip(buf)) {
      const n = unzip(buf, base);
      flatten(base);
      console.log(`[SESSION_ID] restored ${n} file(s) from zip`);
      return n;
    }
    if (isGzip(buf)) {
      const tmp = path.join(base, '.sessionid.tar.gz');
      fs.writeFileSync(tmp, buf);
      execFileSync('tar', ['-xzf', tmp, '-C', base]);
      fs.rmSync(tmp, { force: true });
      flatten(base);
      console.log('[SESSION_ID] restored from tar.gz');
      return 1;
    }
    // Raw JSON creds.json
    const creds = JSON.parse(buf.toString('utf8'));
    const raw = creds?.me?.id || creds?.me || '';
    const number = String(raw).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    if (!/^[0-9]{8,15}$/.test(number)) throw new Error('cannot read number from creds');
    const dir = path.join(base, number);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'creds.json'), JSON.stringify(creds));
    console.log(`[SESSION_ID] restored single creds.json -> ${number}`);
    return 1;
  } catch (e) {
    console.log('[SESSION_ID] restore failed:', e?.message || e);
    return 0;
  }
}

module.exports = { restoreFromSessionId };
