/**
 * AI — all AI aliases route to Gemini (if key set) or a keyless engine; plus .imagine (image generation)
 */
const config = require('../config');
const lang = require('../lib/lang');
const { downloadMedia } = require('../lib/helpers');
const imagegen = require('../lib/imagegen');
const { aiCache } = require('../lib/cache');

const STYLE_NOTES = {
  grok: 'Jawab thoda witty aur sharp style mein do.',
  claude: 'Jawab thoughtful aur clear style mein do.',
  deepseek: 'Technical/coding sawal ho to detail se jawab do.',
  mathgpt: 'Ye maths sawal hy — step by step solve karo.',
};

/** fetch with an AbortController timeout (keeps AI snappy — never hangs). */
async function fetchWithTimeout(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

/** Google Gemini — try a list of models so one busy/retired model never breaks AI */
const GEMINI_MODELS = [config.GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'].filter((m, i, a) => m && a.indexOf(m) === i);

async function askGemini(prompt, imageBase64 = null) {
  const parts = [{ text: prompt }];
  if (imageBase64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } });
  let lastErr;
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.GEMINI_API_KEY}`;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: 800 } }),
      }, 10000);
      if (!res.ok) { lastErr = new Error(`AI API error ${res.status}`); continue; }
      const data = await res.json();
      const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('');
      if (out) return out;
      lastErr = new Error('empty');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('AI API error');
}

/** Keyless fallback engine (OpenAI-compatible) — works with no API key */
async function askPollinations(prompt) {
  const res = await fetchWithTimeout('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages: [
        { role: 'system', content: `You are ${config.BOT_NAME}, a helpful, friendly WhatsApp assistant. ${langLine(prompt)} Keep answers clear and useful.` },
        { role: 'user', content: prompt },
      ],
    }),
  }, 12000);
  if (!res.ok) throw new Error(`AI API error ${res.status}`);
  const data = await res.json();
  const out = data.choices?.[0]?.message?.content;
  return out ? String(out).trim() : '❌ Koi jawab nahi mila.';
}


/** Language instruction for the AI, from the user's `.botlanguage` choice. */
function langLine(prompt) {
  const code = currentLang || 'en';
  if (code === 'en') return "Reply in English. If the user writes in Roman Urdu, you may reply in Roman Urdu.";
  const name = (lang.LANGS[code] || [])[0] || 'English';
  return `Reply ONLY in ${name}.`;
}
let currentLang = 'en';

/** Unified AI entry: Gemini if key present, else keyless fallback. Cached for speed. */
async function askAI(prompt, imageBase64 = null, senderNum = null) {
  currentLang = senderNum ? lang.forUser(senderNum) : 'en';
  // Only cache text-only prompts (images are unique).
  const cacheKey = imageBase64 ? null : 'ai:' + prompt.slice(0, 300);
  if (cacheKey) {
    const hit = aiCache.get(cacheKey);
    if (hit) return hit;
  }
  let out;
  if (config.GEMINI_API_KEY) {
    try { out = await askGemini(prompt, imageBase64); }
    catch (e) { /* fall through to keyless engine */ }
  }
  if (!out) out = await askPollinations(prompt);
  if (cacheKey && out) aiCache.set(cacheKey, out);
  return out;
}

const handler = async (ctx) => {
  const { command } = ctx;

  // ---- .imagine : AI image generation ----
  if (command === 'imagine' || command === 'image' || command === 'img') {
    if (!ctx.arg) return ctx.reply(`❌ Prompt likho. Example: ${config.PREFIX}imagine a cyberpunk cat`);
    await imagegen.sendGeneratedImage(
      ctx,
      ctx.arg,
      `🎨 *${config.BOT_NAME} Imagine*\n📝 ${ctx.arg}`,
      { width: 1024, height: 1024 }
    );
    return;
  }

  // ---- AI chat ----
  let prompt = ctx.arg;
  let img = null;
  try {
    const imgMsg = ctx.m.message?.imageMessage || ctx.quoted?.message?.imageMessage;
    if (imgMsg) {
      prompt = prompt || 'Is image ko describe karo.';
      img = (await downloadMedia(imgMsg, 'image')).toString('base64');
    }
  } catch { /* ignore */ }

  if (!prompt) return ctx.reply(`❌ Sawal likho. Example: ${config.PREFIX}${ctx.command} Pakistan ka capital kya hy?`);
  const style = STYLE_NOTES[ctx.command.replace(/[0-9]/g, '')] || '';
  try {
    const answer = await askAI(style ? `${prompt}\n(${style})` : prompt, img, ctx.senderNum);
    await ctx.reply(`🤖 *${config.BOT_NAME} AI*\n\n${answer}`);
  } catch (e) {
    await ctx.reply(`❌ ${e.message}`);
  }
};

module.exports = {
  commands: [...config.AI_ALIASES, 'imagine', 'image', 'img'],
  category: '🤖 AI',
  handler,
  askAI,
};
