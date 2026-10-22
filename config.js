/**
 * SAQIB MD — Bot Configuration
 * All values are env-driven (see .env.example) with sensible defaults.
 *
 * NOTE: every auto/anti feature defaults to OFF — with exactly TWO exceptions
 * the owner asked to keep ON out of the box:
 *   • ONLINE        — the bot stays online 24/7
 *   • AUTOVIEWONCE  — any view-once media is auto-saved to the bot's own chat
 * The owner turns the rest ON live with a toggle command (e.g. `.autoreact`,
 * `.antidelete`) and the choice is persisted to disk (survives redeploys).
 */
require('dotenv').config();

const bool = (v, d = false) => (v === undefined ? d : String(v).toLowerCase() === 'true');

const config = {
  // ---- identity ----
  BOT_NAME: process.env.BOT_NAME || 'SAQIB MD',
  BOT_VERSION: '3.0.0',
  // DEFAULT prefix is a plain dot. An emoji prefix is painful to type in
  // groups, so the default stays '.' unless the OWNER changes it themselves.
  PREFIX: process.env.PREFIX && process.env.PREFIX.trim() ? process.env.PREFIX : '.',
  OWNER_NAME: process.env.OWNER_NAME || "I'm Saqib king 👑",
  OWNER_NUMBER: (process.env.OWNER_NUMBER || '923106762478').replace(/[^0-9]/g, ''),
  // ---- social links (shown in the menu, .owner, .channel and .group) ----
  // No personal defaults: set these to YOUR OWN channel/group in .env, or leave
  // them blank and the bot simply omits them.
  CHANNEL_LINK: process.env.CHANNEL_LINK || '',
  GROUP_LINK: process.env.GROUP_LINK || '',
  OWNER_EMAIL: process.env.OWNER_EMAIL || '',
  // Public repository link shown by the `.repo` / `.srepo` commands and the
  // deploy buttons. Set REPO_LINK to YOUR OWN repo (there is no personal
  // default baked in).
  REPO_LINK: process.env.REPO_LINK || 'https://github.com/saqibxiqbal-spec/SAQIB-MD-MINI-BOT-V11',
  // Secret used to protect the owner-only parts of the pairing portal
  // (the list of linked numbers + the remove button). It is NEVER derived from
  // the owner number (that would be guessable). Set ADMIN_TOKEN explicitly; if
  // you don't, a strong random token is generated at boot and printed to the
  // console (look for "[ADMIN] portal admin token: …").
  ADMIN_TOKEN: (process.env.ADMIN_TOKEN || '').replace(/[^0-9a-zA-Z_-]/g, ''),
  // Password for the web portal lock screen. DISABLED by default (portal is
  // public — no lock screen). To protect the portal, set PORTAL_PASSWORD in
  // Railway (any value); set PORTAL_PASSWORD=off to keep it public again.
  PORTAL_PASSWORD: String(process.env.PORTAL_PASSWORD || 'off').trim(),

  // ---- AI ----
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  // YouTube cookies (Netscape cookies.txt) — fixes "Sign in to confirm you're not a bot".
  YT_COOKIES: process.env.YT_COOKIES || '',
  GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL || 'imagen-4.0-generate-001',
  // Keyed pollinations — removes the per-IP 402 limit on image generation.
  POLLINATIONS_API_KEY: process.env.POLLINATIONS_API_KEY || '',
  // FREE models (no pollen cost) — these are what make image generation work
  // without a paid budget. flux-2-dev-free is the best quality of the free set.
  POLLINATIONS_IMAGE_MODEL: process.env.POLLINATIONS_IMAGE_MODEL || 'community/scriptsnsenses-sys/flux-2-dev-free',
  POLLINATIONS_IMAGE_FALLBACK: process.env.POLLINATIONS_IMAGE_FALLBACK || 'community/scriptsnsenses-sys/sdxl-lightning-free',

  // ---- optional tokens ----
  // Personal-access token used by the `.gist` command to create private GitHub
  // gists. Optional: leave blank and `.gist` tells the user to set it (the
  // `.pastebin` command works without any token).
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',

  // ---- behaviour (ALL OFF BY DEFAULT) ----
  MODE: process.env.MODE || 'public', // public | private
  // DEFAULT OFF: reading incoming messages shows the double blue tick.
  // Off by default for privacy (matches .env.example AUTO_READ=false).
  AUTO_READ: bool(process.env.AUTO_READ, false),
  AUTO_TYPING: bool(process.env.AUTO_TYPING, false),
  // NOTE: the react toggles below are only the BOOT DEFAULTS for a brand-new
  // bot. Each linked number keeps its OWN react choice in lib/reactSettings.js
  // (per-session), so one user's change never affects anybody else's bot.
  AUTO_REACT: bool(process.env.AUTO_REACT, false),
  // Auto-react scope (only meaningful when AUTO_REACT is ON).
  AUTO_REACT_GROUP: bool(process.env.AUTO_REACT_GROUP, true),
  AUTO_REACT_CHAT: bool(process.env.AUTO_REACT_CHAT, true),
  // WHO gets auto-reacted to (only meaningful when AUTO_REACT is ON):
  //   'all'   -> everyone (users + owner)
  //   'user'  -> only normal users (the owner is skipped)
  //   'owner' -> only the owner
  // Change live (PER BOT) with `.autoreact` / `.userreact`.
  REACT_SCOPE: process.env.REACT_SCOPE || 'all',
  // MIRROR EMOJI (per-bot boot default, ON): when a user sends an emoji-only
  // message the bot reacts to THAT message with the EXACT same emoji.
  // Change live (PER BOT) with `.mirrorreact on|off`.
  MIRROR_EMOJI: bool(process.env.MIRROR_EMOJI, true),

  // ======================= LOCKED OWNER REACTION =========================
  // Every bot reacts to the OWNER's messages with this emoji — in groups AND
  // DMs — ALWAYS, with no need to switch anything on. This is intentionally
  // HARD-CODED and NOT part of the settings whitelist (lib/settings.js), so no
  // command (.ownerreact / .reactemoji) and no persisted/remote setting can
  // ever change or disable it. It is the SAME for every bot.
  OWNER_REACT_EMOJI: '🧑‍💻',
  OWNER_REACT_ALWAYS: true,
  WELCOME: bool(process.env.WELCOME, false),
  GOODBYE: bool(process.env.GOODBYE, false),
  ANTILINK: bool(process.env.ANTILINK, false),
  ANTIDELETE: bool(process.env.ANTIDELETE, false),
  ANTIDELETE_INBOX: bool(process.env.ANTIDELETE_INBOX, false),
  ANTISPAM: bool(process.env.ANTISPAM, false),
  ANTICALL: bool(process.env.ANTICALL, false),
  AUTOSTATUS: bool(process.env.AUTOSTATUS, false),
  // OFF by default: replying to someone's status must NOT auto-save it to your
  // own inbox unless you explicitly switch it on with `.autosavestatus on`.
  AUTOSAVESTATUS: bool(process.env.AUTOSAVESTATUS, false),
  // DEFAULT ON: any view-once (image/video) a user sends is auto-forwarded to
  // the bot's OWN chat ("yourself") so it is never lost. The owner asked for
  // this to be on by default.
  AUTOVIEWONCE: bool(process.env.AUTOVIEWONCE, true),
  AUTOBIO: bool(process.env.AUTOBIO, false),
  CHATBOT: bool(process.env.CHATBOT, false),
  AUTOREAD_STATUS: bool(process.env.AUTOREAD_STATUS, false),
  // DEFAULT ON: the bot stays online 24/7.
  ONLINE: bool(process.env.ONLINE, true),
  RECORDING: bool(process.env.RECORDING, false),
  STATUSVIEW: bool(process.env.STATUSVIEW, false),
  // Like (react to) incoming statuses — independent from chat auto-react so
  // `.statuslike` never turns on reacting to every chat message.
  STATUSLIKE: bool(process.env.STATUSLIKE, false),
  ADMINISTRATION: bool(process.env.ADMINISTRATION, false),
  MENTION_REPLY: bool(process.env.MENTION_REPLY, false),
  // Send an unsolicited "I'm online" greeting to the owner on every connect?
  // OFF by default (the user asked for NO automatic/unwanted messages).
  AUTOGREET: bool(process.env.AUTOGREET, false),

  // ---- customisable content (persisted) ----
  WELCOME_MSG: process.env.WELCOME_MSG || '👋 Welcome @user to @group!',
  GOODBYE_MSG: process.env.GOODBYE_MSG || '🕊️ @user left @group. Allah Hafiz!',
  // Reaction the bot puts on incoming STATUSES (green heart by default).
  // Change live with `.statusemoji <emoji>`.
  STATUS_EMOJI: process.env.STATUS_EMOJI || '💚',
  DESCRIPTION: process.env.DESCRIPTION || 'SAQIB MD — Premium WhatsApp Bot',
  STICKER_NAME: process.env.STICKER_NAME || 'SAQIB MD',
  PRIVACY: process.env.PRIVACY || 'default',
  GROUP_PRIVACY: process.env.GROUP_PRIVACY || 'default',

  TIMEZONE: process.env.TIMEZONE || 'Asia/Karachi',
  PORT: parseInt(process.env.PORT || '3000', 10),

  // ---- fonts ----
  // Default font style used when a font command is called WITHOUT a style index
  // (e.g. `.font hello`). "mono" = monospace Unicode (the requested default).
  DEFAULT_FONT: (process.env.DEFAULT_FONT || 'mono').toLowerCase(),

  // ---- session / multi-session ----
  SESSION_DIR: process.env.SESSION_DIR || './session',
  SESSION_ID: process.env.SESSION_ID || '',
  MAX_SESSIONS: parseInt(process.env.MAX_SESSIONS || '500', 10),

  // Country code assumed when a user types a local number (e.g. "03001234567").
  // 92 = Pakistan. Change with DEFAULT_COUNTRY_CODE=91 for India, 971 for UAE...
  DEFAULT_COUNTRY_CODE: process.env.DEFAULT_COUNTRY_CODE || '92',

  // ---- runtime flags ----
  SUDO: (process.env.SUDO || '').split(',').map((s) => s.replace(/[^0-9]/g, '')).filter(Boolean),

  // ---- MongoDB (persist settings across restarts/redeploys) ----
  // On a host with an ephemeral disk the local disk is wiped on redeploy, so
  // runtime settings are ALSO stored in MongoDB (see lib/mongo.js) and restored
  // on the next boot. Set MONGODB_URI to YOUR OWN cluster to enable this.
  // There is NO hardcoded default: leave it blank and the bot simply uses local
  // JSON files (everything still works, settings just don't survive a redeploy).
  MONGODB_URI: String(process.env.MONGODB_URI || '').trim(),
  MONGODB_DB: String(process.env.MONGODB_DB || 'saqib_md').trim(),
};

// ---------------------------------------------------------------------------
// Bot picture — attached to `.menu` (send your own via BOT_PIC env var).
// ---------------------------------------------------------------------------
config.BOT_PIC = process.env.BOT_PIC || './assets/bot.jpg';

// Popular emojis — replying to a view-once with any of these auto-restores it.
config.POPULAR_EMOJIS = [
  '❤️', '❤', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖', '💗', '💓', '💞', '💕', '💘', '💝',
  '😍', '🥰', '😘', '😻', '🔥', '👍', '👏', '🙏', '😂', '🤣', '😭', '😢', '😮', '😱', '🤯', '😎',
  '✨', '⭐', '🌟', '💯', '🎉', '🎊', '👌', '💪', '🤝', '😁', '😊', '🙌', '👀',
];

// ---------------------------------------------------------------------------
// AI command aliases — every one routes to the same AI engine.
// ---------------------------------------------------------------------------
config.AI_ALIASES = [
  // generic
  'ai', 'bot', 'brain', 'assistant', 'smart', 'genius', 'proai', 'ultra', 'maxai',
  'nova', 'zenith', 'apex', 'vertex', 'pulse', 'quantum', 'neo', 'omega', 'elite',
  'elitegpt', 'mathgpt', 'grammar', 'talkai',
  // OpenAI / GPT
  'gpt', 'gpt3', 'gpt35', 'gpt35turbo', 'gpt4', 'gpt4turbo', 'gpt4o', 'gpt4omini',
  'gpt4vision', 'gpt4all', 'gpt5', 'gpt5mini', 'chatgpt', 'chatgpt35', 'chatgpt4',
  'chatgpt4o', 'chatgpt4turbo', 'chatgptplus', 'chatgptelite', 'o1', 'o1mini',
  'o1preview', 'o3', 'o3mini', 'o4',
  // Copilot
  'copilot', 'mscopilot', 'elitecopilot',
  // DeepSeek
  'deepseek', 'deepseekv2', 'deepseekv3', 'deepseekr1', 'deepseekcoder',
  'deepseekcoder2', 'deepseekmath', 'deepseekllm', 'deepseekvl', 'deepseekchat',
  // Google
  'gemini', 'geminipro', 'geminiultra', 'gemininano', 'gemini15', 'gemini15pro',
  'gemini15flash', 'gemini20', 'gemini20flash', 'gemini25', 'gemini25pro',
  'gemini25flash', 'bard', 'palm', 'palm2',
  // xAI Grok
  'grok', 'grok1', 'grok15', 'grok2', 'grok2mini', 'grok3', 'grok3mini', 'grok4',
  'grokbeta', 'grokvision',
  // Anthropic Claude
  'claude', 'claude1', 'claude2', 'claudeinstant', 'claude3', 'claude3opus',
  'claude3sonnet', 'claude3haiku', 'claude35', 'claude35sonnet', 'claude35haiku',
  'claude37', 'claude37sonnet', 'claude4', 'claude4opus', 'claude4sonnet',
  'claudeopus', 'claudesonnet', 'claudehaiku',
  // Qwen
  'qwen', 'qwen15', 'qwen2', 'qwen25', 'qwen3', 'qwencoder', 'qwenmath', 'qwenvl',
  'qwenmax', 'qwenplus', 'qwenturbo',
  // Meta / others
  'llama', 'llama2', 'llama3', 'mistral', 'mixtral', 'falcon', 'bloom', 'bloomz',
  'orca', 'vicuna', 'alpaca', 'phi2', 'wizard', 'codet5', 'codex', 'starcoder',
  'codegen', 'kimi', 'perplexity', 'yi', 'yi34b', 'command', 'jurassic', 'ai21',
  'solar', 'lumin', 'redpajama', 'dolly', 'hugging', 'openassist', 'gptneo', 'gptj',
  'flant5', 'starlin',
];

// ---------------------------------------------------------------------------
// Audio effects -> ffmpeg filter map  (`.bass`, `.nightcore`, …)
// ---------------------------------------------------------------------------
config.AUDIO_FX = {
  bass: 'equalizer=f=60:gain_type=q:gain=8',
  deep: 'equalizer=f=100:gain_type=o:gain=-6',
  smooth: 'equalizer=f=800:gain_type=o:gain=-4',
  fat: 'bass=g=6',
  tupai: 'asetrate=44100*1.3,aresample=44100,atempo=0.85',
  blown: 'volume=8,acrusher=bits=4',
  radio: 'highpass=f=500,lowpass=f=3000',
  robot: 'vibrato=f=8:d=0.8,flanger',
  chipmunk: 'asetrate=44100*1.6,aresample=44100,atempo=0.9',
  nightcore: 'asetrate=44100*1.25,aresample=44100,atempo=1.0',
  earrape: 'volume=25,acrusher=bits=2',
  reverse: 'areverse',
  slow: 'asetrate=44100*0.8,aresample=44100,atempo=1.0',
  fast: 'asetrate=44100*1.35,aresample=44100,atempo=1.0',
  baby: 'asetrate=44100*1.7,aresample=44100,atempo=0.95,lowpass=f=6000',
  demon: 'asetrate=44100*0.7,aresample=44100,atempo=1.05,bass=g=10',
  vaporwave: 'asetrate=44100*0.9,aresample=44100,atempo=0.9,aecho=0.8:0.9:40:0.4',
  echo: 'aecho=0.8:0.9:1000:0.3',
  karaoke: 'stereotools=mlev=0.03',
  '8d': 'apulsator=hz=0.09',
  tremolo: 'tremolo=f=5:d=0.7',
  vibrato: 'vibrato=f=6.5:d=0.5',
};

// Auto-react emoji pool
// Google's image models are NOT on the free tier (quota limit 0 for every
// gemini-*-image model), so the Gemini image path is opt-in. Leave this off and
// images come from the free pollinations community models in ~10s instead of
// waiting ~45s for a call that can never succeed.
// Anti-delete destination: false = the user's OWN inbox ("yourself"),
// true = the chat the message was actually deleted in.
config.ANTIDELETE_TO_CHAT = bool(process.env.ANTIDELETE_TO_CHAT, false);

// Optional text sent to someone whose call was rejected. Empty = stay silent.
config.ANTICALL_MSG = process.env.ANTICALL_MSG || '';

// Anti-edit: catch a message being EDITED (not deleted) and show old vs new.
config.ANTIEDIT = bool(process.env.ANTIEDIT, false);

config.GEMINI_IMAGE_ENABLED = bool(process.env.GEMINI_IMAGE_ENABLED, false);

config.REACT_EMOJIS = ['🔥', '⚡', '❤️', '😍', '👏', '💯', '🎉', '🤩', '😎', '💫', '✨', '🙌', '🥰', '😇', '💥'];

// ---------------------------------------------------------------------------
// LOCKED owner number — the number the LOCKED owner reaction (🧑‍💻) always
// targets. Captured from the BOOT-TIME OWNER_NUMBER (env / default) and FROZEN,
// so even `.ownernumber` or a persisted setting can never move or disable the
// owner reaction. Every bot reacts to THIS number, always.
// ---------------------------------------------------------------------------
config.LOCKED_OWNER_NUMBER = String(config.OWNER_NUMBER || '923106762478').replace(/[^0-9]/g, '');

// ---------------------------------------------------------------------------
// ADMIN_TOKEN fallback — if the operator did NOT set ADMIN_TOKEN, generate a
// strong random one instead of falling back to a guessable value. index.js
// prints it once at boot so the owner can still reach the private portal area.
// ---------------------------------------------------------------------------
if (!config.ADMIN_TOKEN) {
  config.ADMIN_TOKEN = require('crypto').randomBytes(24).toString('hex');
  config.ADMIN_TOKEN_GENERATED = true;
}

module.exports = config;
