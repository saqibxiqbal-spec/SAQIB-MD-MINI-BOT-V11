/**
 * AI-2 — extra AI helpers (OCR, bio, resume, translate-style extras)
 * Uses the same keyless fallback as plugins/ai.js (pollinations) and
 * config.GEMINI_API_KEY when the owner sets one.
 */
const config = require('../config');
const { getJSON, downloadMedia } = require('../lib/helpers');

const P = () => config.PREFIX;

// Some prompts make the free model ramble inside its reasoning loop and never
// emit an answer. This suffix pushes it to reply directly.
const DIRECT = 'Reply with the answer only. Do not explain your thinking, do not repeat the question.';

async function ask(prompt, system) {
  // Prefer Gemini when a key exists, else the keyless fallback.
  if (config.GEMINI_API_KEY) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent?key=${config.GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: (system ? system + '\n\n' : '') + prompt }] }] }),
      });
      const d = await r.json();
      const t = d?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (t) return t.trim();
    } catch { /* fall through */ }
  }
  // Keyless fallback. The free endpoint rate-limits bursts with HTTP 402, so
  // retry a few times with backoff before giving up — this is what makes the
  // commands reliable in practice.
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Streaming: the free tier sometimes buffers a whole reply for a long
      // time (or sends an empty body); streaming returns the text as it is
      // generated, so a stall can never eat the whole answer.
      const res = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai', stream: true,
          messages: [{ role: 'system', content: system || 'You are a helpful assistant. Answer briefly.' }, { role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let out = '';
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          const s = line.replace(/^data:\s*/, '').trim();
          if (!s || s === '[DONE]') continue;
          try {
            const j = JSON.parse(s);
            const ch = j?.choices?.[0];
            const d = ch?.delta || {};
            // Only `content` is the final answer. `reasoning` is the model
            // thinking out loud — never show that to the user.
            const piece = d.content || d.message?.content || ch?.message?.content || '';
            if (piece) out += piece;
          } catch { /* partial line — ignore */ }
        }
        if (out.length > 4000) break;
      }
      out = out.trim();
      // Some models stop mid-word; a reply under ~15 chars is a stall, not an
      // answer — retry instead of sending garbage.
      if (out.length >= 15) return out;
      // The model thought out loud but never produced an answer (some prompts
      // trip its reasoning loop). Retry — usually the next attempt answers.
      lastErr = new Error('empty reply');
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw lastErr || new Error('AI busy');
}

const handler = async (ctx) => {
  const { command, reply, arg } = ctx;
  try {
  switch (command) {
    case 'ocr': {
      const q = ctx.quoted || ctx.m;
      const img = q?.message?.imageMessage || q?.message?.documentMessage;
      if (!img) return reply(`❌ Kisi image par reply karke ${P()}ocr likho.`);
      try {
        const buf = await downloadMedia(img, img.mimetype?.startsWith('image') ? 'image' : 'document');
        const b64 = buf.toString('base64');
        // free OCR.space demo key — works without signup for light use
        const r = await fetch('https://api.ocr.space/parse/image', {
          method: 'POST',
          headers: { apikey: 'helloworld', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ base64Image: `data:${img.mimetype || 'image/png'};base64,${b64}`, language: 'eng' }),
        });
        const d = await r.json();
        const txt = d?.ParsedResults?.[0]?.ParsedText?.trim();
        if (!txt) throw new Error('no text');
        return reply(`🔍 *OCR result*\n\n${txt.slice(0, 3000)}`);
      } catch {
        return reply('❌ Image se text nahi nikal paya. Saaf/clear image bhejo.');
      }
    }
    case 'bioai': {
      const about = arg || 'general';
      const out = await ask(`Write 5 short WhatsApp/Instagram bio lines about: ${about}. Each under 60 characters, use emojis, no numbering.`, 'You write catchy short bios.');
      return reply(`✨ *Bio ideas — ${about}*\n\n${out}`);
    }
    case 'resume': {
      if (!arg) return reply(`❌ Apni details do. Example:\n${P()}resume Ali, 24, BS CS, 2 years React, Lahore`);
      const out = await ask(`Write a clean, professional resume in plain text for: ${arg}. Include Summary, Skills, Experience, Education, Projects. Keep it under 300 words.`, 'You are an expert resume writer. Be concise and ATS-friendly.');
      return reply(`📄 *Resume draft*\n\n${out}`);
    }
    case 'summarize': {
      if (!arg) return reply(`❌ Text ya link do. Example: ${P()}summarize <text>`);
      const out = await ask(`Summarize this in 3 short bullet points, Roman Urdu me:\n\n${arg}`, 'You summarize clearly and briefly.');
      return reply(`📝 *Summary*\n\n${out}`);
    }
    case 'rewrite': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}rewrite <text>`);
      const out = await ask(`Rewrite this more clearly and professionally:\n\n${arg}`, 'You rewrite text to be clear and correct.');
      return reply(`✍️ *Rewritten*\n\n${out}`);
    }
    case 'tone': {
      const [mode, ...rest] = (arg || '').split('|').map((s) => s.trim());
      const text = rest.join(' ');
      if (!mode || !text) return reply(`❌ Format: ${P()}tone formal | <text>`);
      const out = await ask(`Rewrite this text in a ${mode} tone:\n\n${text}`, 'You adjust tone precisely.');
      return reply(`🎭 *${mode} tone*\n\n${out}`);
    }
    case 'bullet': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}bullet <text>`);
      const out = await ask(`Convert this into 4-6 short bullet points:\n\n${arg}`, 'You convert prose into bullets.');
      return reply(`• *Points*\n\n${out}`);
    }
    case 'email': {
      if (!arg) return reply(`❌ Context do. Example: ${P()}email leave application for 3 days`);
      const out = await ask(`Write a short professional email about: ${arg}. Include Subject line.`, 'You write concise professional emails.');
      return reply(`📧 *Email draft*\n\n${out}`);
    }
    case 'replygen': {
      if (!arg) return reply(`❌ Message do jiska reply chahiye. Example: ${P()}replygen <their msg>`);
      const out = await ask(`Write 3 possible replies (short, friendly) to this message:\n\n${arg}`, 'You write natural chat replies.');
      return reply(`💬 *Reply options*\n\n${out}`);
    }
    case 'explain': {
      if (!arg) return reply(`❌ Concept do. Example: ${P()}explain photosynthesis`);
      const out = await ask(`Explain "${arg}" simply in Roman Urdu, with one real-life example. Under 120 words.`, 'You explain things simply to beginners.');
      return reply(`📚 *${arg}*\n\n${out}`);
    }
    case 'eli5': {
      if (!arg) return reply(`❌ Concept do. Example: ${P()}eli5 black holes`);
      const out = await ask(`Explain "${arg}" like I am 5 years old. Very simple words, Roman Urdu.`, 'You explain to a 5 year old.');
      return reply(`🧒 *${arg} — bilkul asaan*\n\n${out}`);
    }
    case 'solve': {
      if (!arg) return reply(`❌ Sawal do. Example: ${P()}solve 15% of 480`);
      const out = await ask(`Solve step by step: ${arg}`, 'You solve math step by step and show the work.');
      return reply(`🧮 *Solution*\n\n${out}`);
    }
    case 'ideas': {
      if (!arg) return reply(`❌ Topic do. Example: ${P()}ideas small business in Karachi`);
      const out = await ask(`Give 7 practical ideas for: ${arg}. Short one-line each, Roman Urdu.`, 'You give practical, actionable ideas.');
      return reply(`💡 *Ideas — ${arg}*\n\n${out}`);
    }
    case 'poem': {
      if (!arg) return reply(`❌ Topic do. Example: ${P()}poem chand`);
      const out = await ask(`Write a short 6-line Urdu-style poem (Roman Urdu) about: ${arg}`, 'You write short emotional poems.');
      return reply(`🪶 *${arg}*\n\n${out}`);
    }
    case 'story': {
      if (!arg) return reply(`❌ Prompt do. Example: ${P()}story ek chor jo imandar ban gaya`);
      const out = await ask(`Aik chhoti kahani likho (Roman Urdu, ~100 words): ${arg}. Aakhir me aik line ka sabaq likho. Sirf kahani likho.`, 'Reply with the story text only. No analysis.');
      return reply(`📖 *Kahani*\n\n${out}`);
    }
    case 'caption': {
      if (!arg) return reply(`❌ Context do. Example: ${P()}caption sunset at beach`);
      const out = await ask(`Write 5 short captions (with emojis) for a photo about: ${arg}`, 'You write catchy short captions.');
      return reply(`📸 *Captions*\n\n${out}`);
    }
    case 'hashtags': {
      if (!arg) return reply(`❌ Topic do. Example: ${P()}hashtags cricket`);
      const out = await ask(`Give 15 relevant hashtags for: ${arg}. Just hashtags, comma separated.`, 'You generate relevant hashtags.');
      return reply(`#️⃣ *Hashtags — ${arg}*\n\n${out}`);
    }
    case 'keywords': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}keywords best laptop for students`);
      const out = await ask(`List 10 SEO keywords for: ${arg}. Comma separated.`, 'You are an SEO expert.');
      return reply(`🔑 *SEO keywords*\n\n${out}`);
    }
    case 'quizgen': {
      if (!arg) return reply(`❌ Topic do. Example: ${P()}quizgen Pakistan history`);
      const out = await ask(`Create 5 MCQs about: ${arg}. Format: question, then 4 options (a-d), then answer.`, 'You create clear MCQs.');
      return reply(`📝 *Quiz — ${arg}*\n\n${out}`);
    }
    case 'flashcards': {
      if (!arg) return reply(`❌ Topic do. Example: ${P()}flashcards biology cells`);
      const out = await ask(`Create 6 flashcards about: ${arg}. Format each as "Q: ... | A: ..."`, 'You create study flashcards.');
      return reply(`🃏 *Flashcards — ${arg}*\n\n${out}`);
    }
    case 'coverletter': {
      if (!arg) return reply(`❌ Job/role do. Example: ${P()}coverletter junior web developer`);
      const out = await ask(`Write a short cover letter for: ${arg}. Under 200 words, professional.`, 'You write concise cover letters.');
      return reply(`📨 *Cover letter*\n\n${out}`);
    }
    case 'interview': {
      if (!arg) return reply(`❌ Field do. Example: ${P()}interview software engineer`);
      const out = await ask(`Give 5 common interview questions with short model answers for: ${arg}`, 'You coach interview candidates.');
      return reply(`🎤 *Interview prep — ${arg}*\n\n${out}`);
    }
    case 'thread': {
      if (!arg) return reply(`❌ Topic do. Example: ${P()}thread how to start freelancing`);
      const out = await ask(`Write a 6-tweet thread about: ${arg}. Number each tweet 1/ 2/ etc, each under 240 chars.`, 'You write engaging Twitter threads.');
      return reply(`🧵 *Thread — ${arg}*\n\n${out}`);
    }
    case 'linkedin': {
      if (!arg) return reply(`❌ Topic do. Example: ${P()}linkedin my first job`);
      const out = await ask(`Write a LinkedIn post about: ${arg}. Professional, 120 words, with a hook and 3 hashtags.`, 'You write LinkedIn posts.');
      return reply(`💼 *LinkedIn post*\n\n${out}`);
    }
    case 'adcopy': {
      if (!arg) return reply(`❌ Product do. Example: ${P()}adcopy homemade pickles`);
      const out = await ask(`Write 3 short ad copies (Facebook/Insta style) for: ${arg}. Roman Urdu, with CTA.`, 'You write high-converting ad copy.');
      return reply(`📢 *Ad copy*\n\n${out}`);
    }
    case 'slogan': {
      if (!arg) return reply(`❌ Brand do. Example: ${P()}slogan chai cafe`);
      const out = await ask(`Give 7 catchy slogans for: ${arg}`, 'You write punchy slogans.');
      return reply(`🏷️ *Slogans — ${arg}*\n\n${out}`);
    }
    case 'namegen': {
      if (!arg) return reply(`❌ Type do. Example: ${P()}namegen clothing brand`);
      const out = await ask(`Suggest 10 brand/business names for: ${arg}. Short, memorable, with one-line meaning.`, 'You are a brand naming expert.');
      return reply(`🏢 *Names — ${arg}*\n\n${out}`);
    }
    case 'babynames': {
      const letter = (arg || 'A').trim()[0].toUpperCase();
      const out = await ask(`Give 10 Muslim baby names starting with "${letter}" — 5 boys, 5 girls — with meanings.`, 'You suggest baby names with meanings.');
      return reply(`👶 *Baby names — ${letter}*\n\n${out}`);
    }
    case 'langdetect': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}langdetect bonjour tout le monde`);
      const out = await ask(`What language is this text? Answer with the language name and confidence only:\n\n${arg}`, 'You detect languages.');
      return reply(`🌐 *Language*\n\n${out}`);
    }
    case 'sentiment': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}sentiment mujhe aaj bohat khushi hui`);
      const out = await ask(`What is the sentiment of this text (positive/negative/neutral) and why, in one line:\n\n${arg}`, 'You analyze sentiment.');
      return reply(`🧠 *Sentiment*\n\n${out}`);
    }
    case 'compare': {
      if (!arg) return reply(`❌ Do cheezein do. Example: ${P()}compare iPhone vs Samsung`);
      const out = await ask(`Compare ${arg} in a short table-ish format (pros/cons/verdict). Roman Urdu.`, 'You compare things objectively.');
      return reply(`⚖️ *Comparison*\n\n${out}`);
    }
    case 'decide': {
      if (!arg) return reply(`❌ Choice do. Example: ${P()}decide job ya business`);
      const out = await ask(`Help me decide: ${arg}. Give pros, cons, and a clear recommendation. Roman Urdu.`, 'You help make decisions with pros/cons.');
      return reply(`🤔 *Faisla*\n\n${out}`);
    }
    case 'plan': {
      if (!arg) return reply(`❌ Topic do. Example: ${P()}plan 3 days in Hunza`);
      const out = await ask(`Make a practical plan for: ${arg}. Day-wise or step-wise, short bullets.`, 'You make practical plans.');
      return reply(`🗺️ *Plan — ${arg}*\n\n${out}`);
    }
    case 'dream': {
      if (!arg) return reply(`❌ Khwab likho. Example: ${P()}dream paani me girna`);
      const out = await ask(`Interpret this dream: ${arg}. Give an Islamic + general view briefly, and note it is not a certainty.`, 'You interpret dreams carefully.');
      return reply(`🌙 *Khwab ki tabeer*\n\n${out}`);
    }
    case 'hook': {
      if (!arg) return reply(`❌ Topic do. Example: ${P()}hook weight loss`);
      const out = await ask(`Give 7 scroll-stopping video hooks for: ${arg}. Short one-liners, Roman Urdu.`, 'You write viral hooks.');
      return reply(`🎬 *Hooks — ${arg}*\n\n${out}`);
    }
    case 'expand': {
      if (!arg) return reply(`❌ Point do. Example: ${P()}expand time management`);
      const out = await ask(`Expand this into a short 120-word paragraph:\n\n${arg}`, 'You expand ideas into clear paragraphs.');
      return reply(`📄 *Expanded*\n\n${out}`);
    }
    case 'seo': {
      if (!arg) return reply(`❌ URL ya topic do. Example: ${P()}seo my shop website`);
      const out = await ask(`Give practical SEO tips for: ${arg}. 6 short bullets.`, 'You are an SEO consultant.');
      return reply(`📈 *SEO tips*\n\n${out}`);
    }
    case 'code': {
      if (!arg) return reply(`❌ Sawal do. Example: ${P()}code javascript me array reverse`);
      const out = await ask(`Answer this coding question with a short code snippet and explanation:\n\n${arg}`, 'You are a senior developer. Give correct, concise code.');
      return reply(`💻 *Code help*\n\n${out}`);
    }
    case 'essay': {
      if (!arg) return reply(`❌ Topic do. Example: ${P()}essay water pollution`);
      const out = await ask(`Write a short essay (200 words) on: ${arg}. With intro, body, conclusion.`, 'You write clear short essays.');
      return reply(`📝 *Essay — ${arg}*\n\n${out}`);
    }
    case 'tweet': {
      if (!arg) return reply(`❌ Topic do. Example: ${P()}tweet my first day at work`);
      const out = await ask(`Write a punchy tweet (under 280 chars) about: ${arg}. Add 2 hashtags.`, 'You write viral tweets.');
      return reply(`🐦 *Tweet*\n\n${out}`);
    }
    case 'detectai': {
      if (!arg) return reply(`❌ Text do. Example: ${P()}detectai <text>`);
      const out = await ask(`Is this text written by AI or a human? Answer "AI" or "Human" with a one-line reason:\n\n${arg}`, 'You detect AI-written text.');
      return reply(`🤖 *AI detection*\n\n${out}`);
    }
    case 'persona': {
      const [who, ...rest] = (arg || '').split('|').map((s) => s.trim());
      const q = rest.join(' ');
      if (!who || !q) return reply(`❌ Format: ${P()}persona doctor | mujhe bukhar hai`);
      const out = await ask(q, `You are role-playing as: ${who}. Stay in character, answer briefly in Roman Urdu.`);
      return reply(`🎭 *${who}*\n\n${out}`);
    }
    case 'voiceai': {
      if (!arg) return reply(`❌ Sawal do. Example: ${P()}voiceai aaj mausam kaisa hai`);
      const out = await ask(arg, 'Answer in one short Roman Urdu sentence.');
      return reply(`🤖 *AI*\n\n${out}\n\n_Tip: ${P()}tts ${out.slice(0, 80)} — voice note ke liye._`);
    }
    default:
      return reply('❓ Unknown AI command');
  }
  } catch {
    return reply('🤖 AI abhi busy hai ya network slow hai. Thori der baad try karo.');
  }
};

module.exports = {
  commands: [
    'ocr', 'bioai', 'resume', 'summarize', 'rewrite', 'tone', 'bullet', 'email', 'replygen', 'explain',
    'eli5', 'solve', 'ideas', 'poem', 'story', 'hashtags', 'keywords', 'quizgen', 'flashcards',
    'coverletter', 'interview', 'thread', 'linkedin', 'adcopy', 'slogan', 'namegen', 'babynames', 'langdetect',
    'sentiment', 'compare', 'decide', 'plan', 'dream', 'hook', 'expand', 'seo', 'essay', 'tweet',
    'detectai', 'persona', 'voiceai',
  ],
  category: '🧠 AI SMART',
  handler,
};
