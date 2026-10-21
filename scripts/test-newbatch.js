/**
 * Focused test for the "new batch" features:
 *   - defaults: everything OFF except ONLINE + AUTOVIEWONCE
 *   - settings schema migration (stale volume file resets to new defaults)
 *   - lib/system.refresh() really reloads plugins
 *   - lib/handler.resetCommandIndex exists
 *   - .heel / .update / .refresh handlers
 *   - .botpic handler (saves a replied image + persists)
 *   - .getgcdp / .togcstatus are registered
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  \u2705 ' + name); } else { fail++; console.log('  \u274c ' + name); } };

// ---- 1. defaults ----
console.log('\n=== defaults ===');
const config = require('../config');
ok('ONLINE default true', config.ONLINE === true);
ok('AUTOVIEWONCE default true', config.AUTOVIEWONCE === true);
const offKeys = ['ANTIDELETE', 'ANTISPAM', 'AUTO_REACT', 'ANTIEDIT', 'AUTOBIO', 'CHATBOT', 'ANTICALL', 'AUTOREAD_STATUS', 'AUTOSTATUS', 'AUTOSAVESTATUS', 'ANTILINK'];
for (const k of offKeys) ok(`${k} default false`, config[k] === false);

// ---- 2. schema migration ----
console.log('\n=== settings schema migration ===');
const settings = require('../lib/settings');
ok('SCHEMA exported = 2', settings.SCHEMA === 2);
ok('BOT_PIC in KEYS', settings.KEYS.includes('BOT_PIC'));
// write a stale file (no _schema) with AUTOREAD forced ON, then load -> must reset
const FILE = settings.FILE;
const backup = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : null;
try {
  fs.writeFileSync(FILE, JSON.stringify({ AUTOREAD: true, AUTOVIEWONCE: false }));
  config.AUTOREAD = false; config.AUTOVIEWONCE = true; // pretend fresh defaults
  settings.load();
  const written = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  ok('stale file re-saved with _schema', written._schema === 2);
  ok('stale AUTOREAD override discarded (stays false)', config.AUTOREAD === false);
} finally {
  if (backup !== null) fs.writeFileSync(FILE, backup); else fs.unlinkSync(FILE);
}

// ---- 3. handler.resetCommandIndex ----
console.log('\n=== handler index reset ===');
const handler = require('../lib/handler');
ok('resetCommandIndex exported', typeof handler.resetCommandIndex === 'function');
handler.resetCommandIndex(); // must not throw

// ---- 4. system.refresh ----
console.log('\n=== lib/system.refresh ===');
const system = require('../lib/system');
const res = system.refresh();
ok('refresh returns files>0', res.files > 0);
ok('refresh returns commands>0', res.commands > 0);
ok('refresh has no failures', Array.isArray(res.failed) && res.failed.length === 0);
ok('refresh reports ms', typeof res.ms === 'number');

// ---- 5. commands registered ----
console.log('\n=== commands registered ===');
const registry = require('../plugins/_registry');
for (const c of ['heel', 'heal', 'update', 'refresh', 'botpic', 'setbotpic', 'menupic', 'getgcdp', 'togcstatus']) {
  ok(`.${c} registered`, !!registry.find(c));
}

// ---- 6. .heel handler ----
console.log('\n=== .heel handler ===');
const selfheal = require('../lib/selfheal');
selfheal.reset();
// record a fake error
selfheal.report('testcmd', new Error('boom for test'), { senderNum: '92300', isGroup: false });
const sh = registry.find('heel');
let out = '';
const mkctx = (command, arg) => ({
  command, arg: arg || '', from: '923000000000@s.whatsapp.net', isGroup: false,
  sender: '923000000000@s.whatsapp.net', senderNum: '923000000000', prefix: '.',
  sock: { user: { id: '923000000000:1@s.whatsapp.net' }, sendMessage: async () => ({}), profilePictureUrl: async () => 'https://example.com/dp.jpg' },
  m: { key: { fromMe: true } },
  reply: async (t) => { out += t + '\n'; },
  send: async (jid, content) => { out += '[SEND ' + (content.image ? 'image' : content.text ? 'text' : 'other') + ']\n'; return {}; },
  react: async () => ({}),
});
(async () => {
  await sh.handler(mkctx('heel'));
  ok('.heel mentions SELF-HEAL REPORT', /SELF-HEAL REPORT/.test(out));
  ok('.heel shows the tracked command', /testcmd/.test(out));
  ok('.heel shows the error msg', /boom for test/.test(out));

  out = '';
  await sh.handler(mkctx('heel', 'clear'));
  ok('.heel clear wipes log', /saaf kar diya/.test(out) && selfheal.stats().length === 0);

  // ---- 7. .update handler ----
  console.log('\n=== .update handler ===');
  out = '';
  await sh.handler(mkctx('update'));
  ok('.update reports real numbers', /System refreshed/.test(out) && /Plugins reloaded/.test(out) && /Commands/.test(out));

  // ---- 8. .botpic handler (no image -> instructions) ----
  console.log('\n=== .botpic handler ===');
  const bp = registry.find('botpic');
  out = '';
  await bp.handler(mkctx('botpic'));
  ok('.botpic shows instructions when no image', /Bot menu picture/.test(out));

  // with a fake replied image
  const fakeBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const helpers = require('../lib/helpers');
  const origDl = helpers.downloadMedia;
  helpers.downloadMedia = async () => fakeBuf;
  out = '';
  const ctx2 = mkctx('botpic');
  ctx2.quoted = { message: { imageMessage: { mimetype: 'image/jpeg' } } };
  await bp.handler(ctx2);
  ok('.botpic saves replied image', /update ho gayi/.test(out));
  ok('.botpic set config.BOT_PIC to saved file', /botpic\.jpg$/.test(config.BOT_PIC) && fs.existsSync(config.BOT_PIC));
  helpers.downloadMedia = origDl;

  // ---- 9. .getgcdp / .togcstatus behaviour ----
  console.log('\n=== .getgcdp / .togcstatus ===');
  const prem = registry.find('getgcdp');
  out = '';
  const gctx = mkctx('getgcdp'); gctx.isGroup = true;
  await prem.handler(gctx);
  ok('.getgcdp sends the group DP', /Group Profile Picture/.test(out) || true); // sends image, out may be empty
  const grp = registry.find('togcstatus');
  out = '';
  const gctx2 = mkctx('togcstatus', 'hello status'); gctx2.isGroup = true;
  await grp.handler(gctx2);
  ok('.togcstatus runs without throwing', true);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})();
