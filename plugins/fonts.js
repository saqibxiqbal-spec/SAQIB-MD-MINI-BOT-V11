/**
 * FONTS — text styling commands (font1 … font105)
 * A library of Unicode transforms; numbered commands map onto them (and
 * cycle with light decorations so all 105 names resolve to something fun).
 */
const config = require('../config');

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const a = 'abcdefghijklmnopqrstuvwxyz';
const N = '0123456789';

// helper: build a mapper from two source strings + two target strings.
// IMPORTANT: we iterate by *code point* ([...str]) — NOT by UTF-16 code unit.
// The styled alphabets (𝐀, 𝘼, 𝙈, …) live outside the BMP, so `dstUpper[i]`
// would slice a surrogate pair in half and produce `` ("?") — the exact bug
// that made every math-style font look broken.
function mapper(srcUpper, srcLower, dstUpper, dstLower, srcNum, dstNum) {
  const map = {};
  const su = [...srcUpper], sl = [...srcLower], du = [...dstUpper], dl = [...dstLower];
  for (let i = 0; i < su.length; i++) map[su[i]] = du[i];
  for (let i = 0; i < sl.length; i++) map[sl[i]] = dl[i];
  if (srcNum && dstNum) {
    const sn = [...srcNum], dn = [...dstNum];
    for (let i = 0; i < sn.length; i++) map[sn[i]] = dn[i];
  }
  return (s) => [...s].map((c) => map[c] || c).join('');
}

// combining helpers
const comb = (ch, mark) => [...ch].map((c) => (c === ' ' ? c : c + mark)).join('');

const TRANSFORMS = [
  mapper(A, a, '𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙', '𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳', N, '𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗'),
  mapper(A, a, '𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾𝐿𝑀𝑁𝑂𝑃𝑄𝑅𝑆𝑇𝑈𝑉𝑊𝑋𝑌𝑍', '𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧'),
  mapper(A, a, '𝑨𝑩𝑪𝑫𝑬𝑭𝑮𝑯𝑰𝑱𝑲𝑳𝑴𝑵𝑶𝑷𝑸𝑹𝑺𝑻𝑼𝑽𝑾𝑿𝒀𝒁', '𝒂𝒃𝒄𝒅𝒆𝒇𝒈𝒉𝒊𝒋𝒌𝒍𝒎𝒏𝒐𝒑𝒒𝒓𝒔𝒕𝒖𝒗𝒘𝒙𝒚𝒛'),
  mapper(A, a, '𝒜ℬ𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪𝒫𝒬ℛ𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵', '𝒶𝒷𝒸𝒹ℯ𝒻ℊ𝒽𝒾𝒿𝓀𝓁𝓂𝓃ℴ𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏'),
  mapper(A, a, '𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩', '𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃'),
  mapper(A, a, '𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ', '𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷'),
  mapper(A, a, '𝕬𝕭𝕮𝕯𝕰𝕱𝕲𝕳𝕴𝕵𝕶𝕷𝕸𝕹𝕺𝕻𝕼𝕽𝕾𝕿𝖀𝖁𝖂𝖃𝖄𝖅', '𝖆𝖇𝖈𝖉𝖊𝖋𝖌𝖍𝖎𝖏𝖐𝖑𝖒𝖓𝖔𝖕𝖖𝖗𝖘𝖙𝖚𝖛𝖜𝖝𝖞𝖟'),
  mapper(A, a, '𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ', '𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫', N, '𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡'),
  mapper(A, a, '𝖠𝖡𝖢𝖣𝖤𝖥𝖦𝖧𝖨𝖩𝖪𝖫𝖬𝖭𝖮𝖯𝖰𝖱𝖲𝖳𝖴𝖵𝖶𝖷𝖸𝖹', '𝖺𝖻𝖼𝖽𝖾𝖿𝗀𝗁𝗂𝗃𝗄𝗅𝗆𝗇𝗈𝗉𝗊𝗋𝗌𝗍𝗎𝗏𝗐𝗑𝗒𝗓'),
  mapper(A, a, '𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭', '𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇', N, '𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵'),
  mapper(A, a, '𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡', '𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻'),
  mapper(A, a, '𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕', '𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯'),
  mapper(A, a, '𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉', '𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣', N, '𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿'),
  mapper(A, a, 'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ', 'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ', N, '０１２３４５６７８９'),
  mapper(A, a, 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘQʀsᴛᴜᴠᴡxʏᴢ', 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘqʀsᴛᴜᴠᴡxʏᴢ'),
  mapper(A, a, 'ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖQʳˢᵗᵘᵛʷˣʸᶻ', 'ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖqʳˢᵗᵘᵛʷˣʸᶻ'),
  mapper(A, a, 'ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ', 'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ', N, '⓪①②③④⑤⑥⑦⑧⑨'),
  mapper(A, a, '🅐🅑🅒🅓🅔🅕🅖🅗🅘🅙🅚🅛🅜🅝🅞🅟🅠🅡🅢🅣🅤🅥🅦🅧🅨🅩', '🅐🅑🅒🅓🅔🅕🅖🅗🅘🅙🅚🅛🅜🅝🅞🅟🅠🅡🅢🅣🅤🅥🅦🅧🅨🅩'),
  mapper(A, a, '🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉', '🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉'),
  mapper(A, a, '🅰🅱🅲🅳🅴🅵🅶🅷🅸🅹🅺🅻🅼🅽🅾🅿🆀🆁🆂🆃🆄🆅🆆🆇🆈🆉', '🅰🅱🅲🅳🅴🅵🅶🅷🅸🅹🅺🅻🅼🅽🅾🅿🆀🆁🆂🆃🆄🆅🆆🆇🆈🆉'),
  mapper(A, a, '⒜⒝⒞⒟⒠⒡⒢⒣⒤⒥⒦⒧⒨⒩⒪⒫⒬⒭⒮⒯⒰⒱⒲⒳⒴⒵', '⒜⒝⒞⒟⒠⒡⒢⒣⒤⒥⒦⒧⒨⒩⒪⒫⒬⒭⒮⒯⒰⒱⒲⒳⒴⒵'),
  (s) => comb(s, '\u0336'), // strikethrough
  mapper(A, a, 'ΛBᄃDΣFGΉIJKᒪMПӨPQЯƧTЦVЩXYZ', 'ΛbᄃdΣfgΉijklmпӨpqяƧtцvщxyz'),
  mapper(A, a, 'АБСДЕФГНИЈКЛМНОПКРСТУВШХУЗ', 'абсдефгнијклмнопкрстувшхуз'),
  mapper(A, a, 'ȺƁȻƊɆƑǤǶƗɈꝀȽM₦Ø₱ɊɌ₴ŦɄV₩ӾɎƵ', 'ⱥƀȼɗɇƒǥɦɨɉꝁɬɱƞøᵽɋɍʂŧʉⱴⱳӿɏƶ'),
  mapper(A, a, 'ȦƁĊÐȨƑƓĦƗĴƘĿMŊØƤɊŘŞŦɄVŴXŶƵ', 'ȧƀċðȩƒɠħɨĵƙŀɱŋøƥɋřşŧʉⱱⱳӿɏƶ'),
  mapper(A, a, '卂乃匚ᗪ乇千Ꮆ卄丨ﾌҜㄥ爪几ㄖ卩Ɋ尺丂ㄒㄩᐯ山乂ㄚ乙', '卂乃匚ᗪ乇千Ꮆ卄丨ﾌҜㄥ爪几ㄖ卩ɋ尺丂ㄒㄩᐯ山乂ㄚ乙'),
  mapper(A, a, 'αв¢∂єƒgнιנкℓмησρqяѕтυνωχуz', 'αв¢∂єƒgнιנкℓмησρqяѕтυνωχуz'),
  (s) => comb(s, '\u0332'), // underline
];

// Decorations applied to the plain text for the higher-numbered fonts
const DECOR = [
  (s) => `「${s}」`, (s) => `『${s}』`, (s) => `【${s}】`, (s) => `〔${s}〕`, (s) => `《${s}》`,
  (s) => `✧${s}✧`, (s) => `★${s}★`, (s) => `✦${s}✦`, (s) => `❥${s}❥`, (s) => `『${s}』`,
  (s) => `▁${s}▁`, (s) => `◤${s}◥`, (s) => `➤${s}`, (s) => `『 ${s} 』`, (s) => `⌜${s}⌟`,
];

const TOTAL = 105;

function style(text, idx) {
  const t = TRANSFORMS[idx % TRANSFORMS.length];
  let out = t(text);
  if (idx >= TRANSFORMS.length) out = DECOR[idx % DECOR.length](out);
  return out;
}

// Named aliases → transform index (so users don't have to remember numbers).
// `mono` (monospace) is the bot's DEFAULT font.
const NAMED = {
  mono: 12, monospace: 12, code: 12,
  bold: 0, italic: 1, bolditalic: 2,
  script: 3, boldscript: 4, fraktur: 5, doublestruck: 6, boldfraktur: 7,
  sans: 8, sansbold: 9, sansitalic: 10, sansbolditalic: 11,
  fullwidth: 13, smallcaps: 14, superscript: 15,
  circled: 16, negativesquared: 17, negativecircled: 18, squared: 19, parenthesized: 20,
  strikethrough: 21, cyrillic: 23, fancy: 24, greek: 28, underline: 29,
};

/** Resolve a font command (font<N> or a name) to a transform index, or -1. */
function idxFor(command) {
  const c = String(command || '').toLowerCase();
  if (NAMED[c] !== undefined) return NAMED[c];
  const n = parseInt(c.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n >= 1 ? n - 1 : -1;
}

/** Apply the configured default font (config.DEFAULT_FONT, default 'mono'). */
function applyDefault(text) {
  const idx = NAMED[String(config.DEFAULT_FONT || 'mono').toLowerCase()];
  return style(String(text), idx === undefined ? 12 : idx);
}

const handler = async (ctx) => {
  const { command, reply, arg } = ctx;
  const idx = idxFor(command);
  if (idx < 0) return reply('❓ Unknown font.');
  if (!arg) return reply(`❌ Text do. Example: ${config.PREFIX}${command} SAQIB MD`);
  await reply(style(arg, idx));
};

const commands = [
  ...Array.from({ length: TOTAL }, (_, i) => `font${i + 1}`),
  ...Object.keys(NAMED),
];

module.exports = { commands, category: '🔠 FONTS', handler, style, applyDefault, NAMED };
