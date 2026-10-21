#!/usr/bin/env node
/**
 * Verifies the REACT system for SAQIB-MD-MINI-BOT-V11 (v2 — locked owner +
 * per-bot settings + numbered menu):
 *
 *   LOCKED  : the OWNER is ALWAYS reacted to with 🧑‍💻 — groups AND DMs — by every
 *             bot, with nothing switched on. NO command can change or disable it
 *             (.ownerreact / .reactemoji only ever reply "LOCKED").
 *   PER-BOT : .autoreact / .userreact change ONLY the current bot (session), so
 *             one user's change never affects anybody else's bot.
 *   MENU    : .autoreact (no arg) shows a numbered list; replying 1/2/3 applies
 *             the choice to THIS bot (3 stays locked).
 *
 * Also checks the status emoji default is the GREEN HEART (💚).
 *
 * Run: node test/react-scope-verify.js
 */
const path = require('path');
const os = require('os');
// Isolate the per-session react store into a temp dir BEFORE config loads.
process.env.SESSION_DIR = path.join(os.tmpdir(), 'saqib-react-test-' + Date.now(), 'session');

const config = require('../config');
const settings = require('../lib/settings');
const premium = require('../plugins/premium');
const reactSettings = require('../lib/reactSettings');
const reactMenu = require('../lib/reactMenu');

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  \u2705 ${n}`); } else { fail++; console.log(`  \u274c ${n} ${e}`); } };
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const GREEN_HEART = '\u{1F49A}';
const DEV = '\u{1F9D1}\u200D\u{1F4BB}'; // 🧑‍💻
const FIRE = '\u{1F525}';               // 🔥
const OWNER_NUM = config.LOCKED_OWNER_NUMBER;

/* ---- a ctx for the onMessage hook ---- */
function msgCtx({ senderNum, isGroup = true, sessionNumber = '111', text = 'hello', command = '' }) {
  const calls = [];
  const jid = isGroup ? 'g@g.us' : `${senderNum}@s.whatsapp.net`;
  const sock = {
    sendMessage: async (j, content) => { if (content && content.react) calls.push(content.react.text); return { key: { id: 'x' } }; },
    readMessages: async () => {},
    sendPresenceUpdate: async () => {},
  };
  const m = { key: { remoteJid: jid, id: 'M1', participant: `${senderNum}@s.whatsapp.net` }, message: { conversation: text }, pushName: 'T' };
  return {
    calls,
    ctx: {
      sock, m, from: jid, isGroup, sender: `${senderNum}@s.whatsapp.net`, senderNum,
      text, command, args: [], arg: '', isOwner: senderNum === OWNER_NUM,
      session: { number: sessionNumber },
      reply: async () => {}, send: async () => {},
    },
  };
}

/* ---- a ctx for the command handler ---- */
function cmdCtx({ command, arg = '', sessionNumber = '111', senderNum = OWNER_NUM }) {
  const replies = [];
  const ctx = {
    command, arg, args: String(arg || '').split(/\s+/).filter(Boolean), prefix: '.',
    senderNum, isOwner: senderNum === OWNER_NUM, from: 'g@g.us', isGroup: true,
    session: { number: sessionNumber },
    m: { key: { remoteJid: 'g@g.us', id: 'C1' } },
    reply: async (t) => { replies.push(String(t)); },
    send: async () => {},
    sock: { sendMessage: async () => ({ key: { id: 'x' } }), sendPresenceUpdate: async () => {} },
  };
  return { replies, ctx };
}

function quiet() {
  config.ANTISPAM = false; config.ANTILINK = false; config.AUTOVIEWONCE = false;
  config.CHATBOT = false; config.STATUSVIEW = false; config.STATUSLIKE = false;
  config.AUTOSTATUS = false; config.AUTOREAD_STATUS = false;
}

(async () => {
  quiet();
  reactSettings.set('111', { autoReact: false, autoReactGroup: true, autoReactChat: true, reactScope: 'all' });
  reactSettings.set('222', { autoReact: false, autoReactGroup: true, autoReactChat: true, reactScope: 'all' });

  console.log('\n0) locked constants + defaults');
  check('OWNER_REACT_EMOJI is \ud83e\uddd1\u200d\ud83d\udcbb', config.OWNER_REACT_EMOJI === DEV, JSON.stringify(config.OWNER_REACT_EMOJI));
  check('OWNER_REACT_ALWAYS is true', config.OWNER_REACT_ALWAYS === true, String(config.OWNER_REACT_ALWAYS));
  check('LOCKED_OWNER_NUMBER is the owner', config.LOCKED_OWNER_NUMBER === '923106762478', config.LOCKED_OWNER_NUMBER);
  check('STATUS_EMOJI default is \ud83d\udc9a', config.STATUS_EMOJI === GREEN_HEART, JSON.stringify(config.STATUS_EMOJI));
  check('react keys NOT in shared settings whitelist',
    !settings.KEYS.includes('OWNER_REACT_ALWAYS') && !settings.KEYS.includes('OWNER_REACT_EMOJI') && !settings.KEYS.includes('AUTO_REACT') && !settings.KEYS.includes('REACT_SCOPE'),
    JSON.stringify(settings.KEYS.filter((k) => /REACT/.test(k))));

  console.log('\n1) owner is ALWAYS reacted (nothing on \u2014 group + DM)');
  let o = msgCtx({ senderNum: OWNER_NUM, isGroup: true }); await premium.onMessage(o.ctx); await wait();
  check('owner reacted in GROUP', o.calls.length === 1 && o.calls[0] === DEV, JSON.stringify(o.calls));
  o = msgCtx({ senderNum: OWNER_NUM, isGroup: false }); await premium.onMessage(o.ctx); await wait();
  check('owner reacted in DM', o.calls.length === 1 && o.calls[0] === DEV, JSON.stringify(o.calls));
  let u = msgCtx({ senderNum: '923001234567', isGroup: true }); await premium.onMessage(u.ctx); await wait();
  check('normal user NOT reacted (auto off)', u.calls.length === 0, JSON.stringify(u.calls));

  console.log('\n2) .ownerreact off does NOT disable the owner react');
  let c = cmdCtx({ command: 'ownerreact', arg: 'off' }); await premium.handler(c.ctx);
  check('.ownerreact off replies LOCKED', /LOCKED/i.test(c.replies.join(' ')), JSON.stringify(c.replies));
  check('OWNER_REACT_ALWAYS still true', config.OWNER_REACT_ALWAYS === true, String(config.OWNER_REACT_ALWAYS));
  o = msgCtx({ senderNum: OWNER_NUM, isGroup: true }); await premium.onMessage(o.ctx); await wait();
  check('owner STILL reacted after .ownerreact off', o.calls.length === 1 && o.calls[0] === DEV, JSON.stringify(o.calls));

  console.log('\n3) .reactemoji cannot change the owner emoji');
  c = cmdCtx({ command: 'reactemoji', arg: FIRE }); await premium.handler(c.ctx);
  check('.reactemoji replies LOCKED', /LOCKED/i.test(c.replies.join(' ')), JSON.stringify(c.replies));
  check('OWNER_REACT_EMOJI still \ud83e\uddd1\u200d\ud83d\udcbb', config.OWNER_REACT_EMOJI === DEV, JSON.stringify(config.OWNER_REACT_EMOJI));

  console.log('\n4) .autoreact/.userreact are PER-SESSION');
  c = cmdCtx({ command: 'autoreact', arg: 'on', sessionNumber: '111' }); await premium.handler(c.ctx);
  check('session 111 autoReact ON', reactSettings.get('111').autoReact === true, JSON.stringify(reactSettings.get('111')));
  check('session 222 autoReact STILL OFF', reactSettings.get('222').autoReact === false, JSON.stringify(reactSettings.get('222')));
  u = msgCtx({ senderNum: '923001234567', sessionNumber: '111', isGroup: true }); await premium.onMessage(u.ctx); await wait();
  check('user reacted by session 111', u.calls.length === 1, JSON.stringify(u.calls));
  u = msgCtx({ senderNum: '923001234567', sessionNumber: '222', isGroup: true }); await premium.onMessage(u.ctx); await wait();
  check('user NOT reacted by session 222', u.calls.length === 0, JSON.stringify(u.calls));
  c = cmdCtx({ command: 'userreact', arg: 'off', sessionNumber: '222' }); await premium.handler(c.ctx);
  check('session 111 unaffected by session 222 change', reactSettings.get('111').autoReact === true, JSON.stringify(reactSettings.get('111')));
  check('session 222 remains off', reactSettings.get('222').autoReact === false, JSON.stringify(reactSettings.get('222')));

  console.log('\n5) numbered menu');
  reactSettings.set('111', { autoReact: false, reactScope: 'all' });
  c = cmdCtx({ command: 'autoreact', arg: '', sessionNumber: '111', senderNum: '923001234567' }); await premium.handler(c.ctx);
  check('.autoreact shows a numbered menu', /1/.test(c.replies.join(' ')) && /2/.test(c.replies.join(' ')) && /3/.test(c.replies.join(' ')), JSON.stringify(c.replies));
  check('menu armed for the sender', !!reactMenu.peek('923001234567', '111'), '');
  u = msgCtx({ senderNum: '923001234567', sessionNumber: '111', isGroup: false, text: '1' }); await premium.onMessage(u.ctx); await wait();
  check('reply 1 -> session 111 autoReact ON + scope all', reactSettings.get('111').autoReact === true && reactSettings.get('111').reactScope === 'all', JSON.stringify(reactSettings.get('111')));
  reactSettings.set('111', { autoReact: false });
  c = cmdCtx({ command: 'autoreact', arg: '', sessionNumber: '111', senderNum: '923001234567' }); await premium.handler(c.ctx);
  u = msgCtx({ senderNum: '923001234567', sessionNumber: '111', isGroup: false, text: '2' }); await premium.onMessage(u.ctx); await wait();
  check('reply 2 -> scope user', reactSettings.get('111').autoReact === true && reactSettings.get('111').reactScope === 'user', JSON.stringify(reactSettings.get('111')));
  c = cmdCtx({ command: 'autoreact', arg: '', sessionNumber: '111', senderNum: '923001234567' }); await premium.handler(c.ctx);
  u = msgCtx({ senderNum: '923001234567', sessionNumber: '111', isGroup: false, text: '3' }); await premium.onMessage(u.ctx); await wait();
  check('reply 3 -> owner react stays LOCKED (no change)', config.OWNER_REACT_ALWAYS === true && config.OWNER_REACT_EMOJI === DEV, '');

  console.log('\n6) loop guard \u2014 never react to a reaction');
  const r = msgCtx({ senderNum: OWNER_NUM, isGroup: true });
  r.ctx.m.message = { reactionMessage: { text: FIRE, key: { id: 'M1' } } };
  await premium.onMessage(r.ctx); await wait();
  check('owner reaction message not re-reacted', r.calls.length === 0, JSON.stringify(r.calls));
  const p = msgCtx({ senderNum: OWNER_NUM, isGroup: true });
  p.ctx.m.message = { protocolMessage: { type: 0, key: { id: 'M1' } } };
  await premium.onMessage(p.ctx); await wait();
  check('owner protocol message not reacted', p.calls.length === 0, JSON.stringify(p.calls));

  console.log(`\n${fail === 0 ? '\u2705 ALL PASS' : '\u274c FAILURES'} \u2014 ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
