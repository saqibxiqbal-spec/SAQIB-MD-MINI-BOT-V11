/**
 * SAQIB MD — bot language (i18n)
 *
 * The bot's own reply text is English by default ("pure English" — her words).
 * `.botlanguage <code>` switches the language of the bot's replies for THAT
 * user only, persisted on the /data volume next to saqib-settings.json.
 *
 * 100 languages, keyed by a short code. Only English is fully translated in
 * the UI strings; every other language still works as a real setting and is
 * used for the AI/text-generation layer (ai.js passes the language name to the
 * model), which is what actually matters for "bot speaks my language".
 */
const fs = require('fs');
const path = require('path');

const SESSION_DIR = process.env.SESSION_DIR || path.join(process.cwd(), 'data');
const FILE = path.join(path.dirname(SESSION_DIR), 'saqib-langs.json');

/** 100 languages: code -> [English name, native name]. */
const LANGS = {
  en: ['English', 'English'], ur: ['Urdu', 'اردو'], hi: ['Hindi', 'हिन्दी'],
  ar: ['Arabic', 'العربية'], fa: ['Persian', 'فارسی'], ps: ['Pashto', 'پښتو'],
  bn: ['Bengali', 'বাংলা'], pa: ['Punjabi', 'ਪੰਜਾਬੀ'], sd: ['Sindhi', 'سنڌي'],
  bal: ['Balochi', 'بلوچی'], ne: ['Nepali', 'नेपाली'], si: ['Sinhala', 'සිංහල'],
  ta: ['Tamil', 'தமிழ்'], te: ['Telugu', 'తెలుగు'], kn: ['Kannada', 'ಕನ್ನಡ'],
  ml: ['Malayalam', 'മലയാളം'], mr: ['Marathi', 'मराठी'], gu: ['Gujarati', 'ગુજરાતી'],
  or: ['Odia', 'ଓଡ଼ିଆ'], as: ['Assamese', 'অসমীয়া'], mai: ['Maithili', 'मैथिली'],
  zh: ['Chinese (Simplified)', '中文'], zh_tw: ['Chinese (Traditional)', '繁體中文'],
  yue: ['Cantonese', '廣東話'], ja: ['Japanese', '日本語'], ko: ['Korean', '한국어'],
  th: ['Thai', 'ไทย'], vi: ['Vietnamese', 'Tiếng Việt'], id: ['Indonesian', 'Bahasa Indonesia'],
  ms: ['Malay', 'Bahasa Melayu'], tl: ['Filipino', 'Filipino'], my: ['Burmese', 'မြန်မာ'],
  km: ['Khmer', 'ខ្មែរ'], lo: ['Lao', 'ລາວ'], mn: ['Mongolian', 'Монгол'],
  kk: ['Kazakh', 'Қазақша'], ky: ['Kyrgyz', 'Кыргызча'], uz: ['Uzbek', 'Oʻzbek'],
  tg: ['Tajik', 'Тоҷикӣ'], tk: ['Turkmen', 'Türkmen'], az: ['Azerbaijani', 'Azərbaycan'],
  tr: ['Turkish', 'Türkçe'], he: ['Hebrew', 'עברית'], ku: ['Kurdish', 'Kurdî'],
  hy: ['Armenian', 'Հայերեն'], ka: ['Georgian', 'ქართული'], ru: ['Russian', 'Русский'],
  uk: ['Ukrainian', 'Українська'], be: ['Belarusian', 'Беларуская'], pl: ['Polish', 'Polski'],
  cs: ['Czech', 'Čeština'], sk: ['Slovak', 'Slovenčina'], hu: ['Hungarian', 'Magyar'],
  ro: ['Romanian', 'Română'], bg: ['Bulgarian', 'Български'], sr: ['Serbian', 'Српски'],
  hr: ['Croatian', 'Hrvatski'], sl: ['Slovenian', 'Slovenščina'], bs: ['Bosnian', 'Bosanski'],
  mk: ['Macedonian', 'Македонски'], sq: ['Albanian', 'Shqip'], el: ['Greek', 'Ελληνικά'],
  lt: ['Lithuanian', 'Lietuvių'], lv: ['Latvian', 'Latviešu'], et: ['Estonian', 'Eesti'],
  fi: ['Finnish', 'Suomi'], sv: ['Swedish', 'Svenska'], no: ['Norwegian', 'Norsk'],
  da: ['Danish', 'Dansk'], is: ['Icelandic', 'Íslenska'], nl: ['Dutch', 'Nederlands'],
  de: ['German', 'Deutsch'], fr: ['French', 'Français'], es: ['Spanish', 'Español'],
  pt: ['Portuguese', 'Português'], it: ['Italian', 'Italiano'], ca: ['Catalan', 'Català'],
  gl: ['Galician', 'Galego'], eu: ['Basque', 'Euskara'], cy: ['Welsh', 'Cymraeg'],
  ga: ['Irish', 'Gaeilge'], gd: ['Scottish Gaelic', 'Gàidhlig'], mt: ['Maltese', 'Malti'],
  af: ['Afrikaans', 'Afrikaans'], sw: ['Swahili', 'Kiswahili'], am: ['Amharic', 'አማርኛ'],
  so: ['Somali', 'Soomaali'], yo: ['Yoruba', 'Yorùbá'], ig: ['Igbo', 'Igbo'],
  ha: ['Hausa', 'Hausa'], zu: ['Zulu', 'isiZulu'], xh: ['Xhosa', 'isiXhosa'],
  st: ['Sesotho', 'Sesotho'], mg: ['Malagasy', 'Malagasy'], rw: ['Kinyarwanda', 'Kinyarwanda'],
  ny: ['Chichewa', 'Chichewa'], sn: ['Shona', 'Shona'], lb: ['Luxembourgish', 'Lëtzebuergesch'],
  fo: ['Faroese', 'Føroyskt'], la: ['Latin', 'Latina'], eo: ['Esperanto', 'Esperanto'],
};

const DEFAULT = 'en';
let store = {};
try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { store = {}; }

function save() { try { fs.writeFileSync(FILE, JSON.stringify(store, null, 1)); } catch { /* ignore */ } }
function load() { try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { store = {}; } return store; }
const norm = (n) => String(n || '').replace(/\D/g, '');

/** Language code for a user (defaults to English). */
function forUser(number) { return store[norm(number)] || DEFAULT; }
/** Full record for a user. */
function infoFor(number) {
  const code = forUser(number);
  const [name, native] = LANGS[code] || LANGS[DEFAULT];
  return { code, name, native };
}
function set(number, code) {
  const c = String(code || '').toLowerCase().trim();
  if (!LANGS[c]) return null;
  store[norm(number)] = c;
  save();
  return c;
}
function reset(number) { delete store[norm(number)]; save(); return DEFAULT; }
function has(number) { return !!store[norm(number)]; }
function all() { return { ...store }; }
/** Search languages by code, English name or native name. */
function search(q) {
  const s = String(q || '').toLowerCase().trim();
  return Object.entries(LANGS).filter(([c, [en, nat]]) =>
    c.includes(s) || en.toLowerCase().includes(s) || nat.toLowerCase().includes(s));
}

/* ============================ translation layer ============================ */
/**
 * Real UI translation. Before this, `.botlanguage` only changed the language
 * NAME handed to the AI — the bot's own replies (menus, confirmations, errors)
 * stayed in Roman-English, which is exactly the bug she reported ("I select
 * Sindhi but the bot is still in English"). Now every reply is translated.
 *
 * Free, key-less endpoint (Google's dict-chrome-ex). Command tokens, the bot
 * name and `backticked` spans are MASKED before translating so `.menu`,
 * `.song`, `SAQIB MD` … come back byte-for-byte identical — the example you
 * read is always the exact command you can type.
 */
let config = null;
try { config = require('../config'); } catch { config = null; }

const TR_CACHE = new Map();
const TR_MAX = 3000;
// Google uses a few different codes than our short names.
const GOOGLE_CODE = { zh: 'zh-CN', zh_tw: 'zh-TW', he: 'iw', jv: 'jw', nb: 'no', tl: 'tl', fil: 'tl', yue: 'yue' };
const gcode = (c) => GOOGLE_CODE[c] || c;

const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace command-like tokens with placeholders Google won't touch. */
function mask(text) {
  const store = [];
  const put = (m) => { store.push(m); return `\u27e6C${store.length - 1}\u27e7`; };
  let out = String(text);
  out = out.replace(/`[^`]*`/g, put);                       // `backticked` spans
  const p = escRe((config && config.PREFIX) || '.');
  out = out.replace(new RegExp(p + '[A-Za-z0-9_]+', 'g'), put); // .command tokens
  if (config && config.BOT_NAME) out = out.split(config.BOT_NAME).join(put(config.BOT_NAME));
  if (config && config.OWNER_NAME) out = out.split(config.OWNER_NAME).join(put(config.OWNER_NAME));
  return { out, store };
}
function unmask(text, store) {
  return String(text).replace(/\u27e6C(\d+)\u27e7/g, (_, i) => (store[Number(i)] != null ? store[Number(i)] : ''));
}

/**
 * Translate `text` into language `code`. Returns the original text unchanged
 * for English / unknown codes / empty input, and on any network failure — so a
 * dead endpoint can never break a reply. Results are cached.
 */
async function translate(text, code) {
  const s = String(text == null ? '' : text);
  const c = String(code || DEFAULT).toLowerCase();
  if (!s.trim() || c === DEFAULT || !LANGS[c]) return s;
  if (s.length > 4000) return s; // too long to translate safely — send as-is
  const key = c + '\u0000' + s;
  const hit = TR_CACHE.get(key);
  if (hit !== undefined) return hit;
  const { out, store } = mask(s);
  let res = s;
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(gcode(c))}&q=${encodeURIComponent(out)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const d = await r.json();
      const t = Array.isArray(d) && Array.isArray(d[0]) ? d[0][0] : (Array.isArray(d) ? d[0] : null);
      if (typeof t === 'string' && t.trim()) res = unmask(t, store);
    }
  } catch { /* keep original */ }
  if (TR_CACHE.size > TR_MAX) TR_CACHE.clear();
  TR_CACHE.set(key, res);
  return res;
}

module.exports = { LANGS, DEFAULT, FILE, load, save, forUser, infoFor, set, reset, has, all, search, translate };
