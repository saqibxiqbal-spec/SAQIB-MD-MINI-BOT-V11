/**
 * Font output inspector — prints font1..font105 for a sample string and flags
 * outputs that contain characters likely to render as "?" (non-BMP, PUA, or
 * unusual scripts).
 */
const fonts = require('../plugins/fonts');
const sample = 'SAQIB Md 123';

// Characters that commonly fail to render / show as "?" or boxes.
const RISKY = /[\u{1D400}-\u{1D7FF}\u{13000}-\u{1342F}\u{A500}-\u{A63F}\u{16A0}-\u{16F0}\u{2C00}-\u{2C5F}\u{1F1E6}-\u{1F1FF}\u{2E80}-\u{2FDF}\u{1100}-\u{11FF}]/u;

const ctx = (cmd) => ({
  command: cmd,
  arg: sample,
  reply: (t) => { out.push(t); return Promise.resolve(); },
});
let out = [];

(async () => {
  for (let i = 1; i <= 105; i++) {
    out = [];
    await fonts.handler(ctx(`font${i}`));
    const t = out[0] || '';
    const risky = RISKY.test(t);
    console.log(`font${String(i).padStart(3)}  ${risky ? '⚠️ ' : '  '}${t}`);
  }
})();
