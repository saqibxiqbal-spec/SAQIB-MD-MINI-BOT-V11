/**
 * INFO-2 — lookup / info commands (dictionary, wiki, space, speed, ISS…)
 */
const config = require('../config');
const { getJSON, getText, pick } = require('../lib/helpers');

const P = () => config.PREFIX;

const WORDS = ['serendipity', 'ephemeral', 'resilience', 'eloquent', 'gratitude', 'wanderlust', 'solitude', 'euphoria', 'pragmatic', 'tenacious', 'vivacious', 'lucid'];
const PROVERBS = [
  'Jaldi ka kaam shaitan ka — jaldbazi me nuqsan hota hai.',
  'Boond boond se sagar banta hai.',
  'Jo sabr karta hai wo meetha phal pata hai.',
  'Naach na jane aangan terha.',
  'Ek aur ek gyarah hote hain.',
  'Chor ki dadhi me tinka.',
  'Haath kangan ko aarsi kya.',
  'Andher nagri chaupat raja.',
];
const OTD = {
  '10-14': ['1066 — Battle of Hastings fought in England.', '1947 — Chuck Yeager broke the sound barrier.', '1964 — Martin Luther King Jr. won the Nobel Peace Prize.'],
};

const handler = async (ctx) => {
  const { command, reply, arg } = ctx;

  switch (command) {
    /* ---------------- dictionary / language ---------------- */
    case 'urdudict': case 'define2': {
      if (!arg) return reply(`❌ Lafz do. Example: ${P()}urdudict kitab`);
      try {
        // freedictionaryapi: fast and reliable (the old dictionaryapi.dev
        // frequently returns 522).
        const d = await getJSON(`https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(arg)}`);
        const e = d.entries?.[0];
        const senses = (e?.senses || []).slice(0, 2);
        if (!senses.length) throw new Error('none');
        const ipa = e?.pronunciations?.find((x) => x.type === 'ipa')?.text || '';
        const syn = (e?.synonyms || []).slice(0, 6).join(', ');
        return reply(
          `📖 *${d.word}*${ipa ? ` ${ipa}` : ''}\n_${e?.partOfSpeech || ''}_\n\n` +
          senses.map((x, i) => `${i + 1}. ${x.definition}`).join('\n') +
          (senses[0]?.examples?.[0] ? `\n\n_Example: ${senses[0].examples[0]}_` : '') +
          (syn ? `\n\n🔤 ${syn}` : '')
        );
      } catch {
        return reply(`❌ "${arg}" ka matlab nahi mila. English word try karo.`);
      }
    }
    case 'thesaurus': case 'synonym': {
      if (!arg) return reply(`❌ Lafz do. Example: ${P()}thesaurus happy`);
      const d = await getJSON(`https://api.datamuse.com/words?ml=${encodeURIComponent(arg)}&max=10`);
      if (!d.length) return reply('❌ Kuch nahi mila.');
      return reply(`🔤 *${arg} — similar words*\n\n${d.map((x) => '• ' + x.word).join('\n')}`);
    }
    case 'rhyme': {
      if (!arg) return reply(`❌ Lafz do. Example: ${P()}rhyme time`);
      const d = await getJSON(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(arg)}&max=12`);
      if (!d.length) return reply('❌ Koi rhyme nahi mili.');
      return reply(`🎵 *Rhymes for "${arg}"*\n\n${d.map((x) => x.word).join(', ')}`);
    }
    case 'slang': {
      if (!arg) return reply(`❌ Slang do. Example: ${P()}slang rizz`);
      try {
        const d = await getJSON(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(arg)}`);
        const e = d.list?.[0];
        if (!e) throw new Error('none');
        return reply(`😎 *${arg}*\n\n${(e.definition || '').replace(/[\[\]]/g, '').slice(0, 500)}\n\n_Example:_ ${(e.example || '').replace(/[\[\]]/g, '').slice(0, 200)}`);
      } catch { return reply('❌ Ye slang nahi mili.'); }
    }
    case 'wordoftheday': case 'wotd': {
      const w = pick(WORDS);
      try {
        const d = await getJSON(`https://freedictionaryapi.com/api/v1/entries/en/${w}`);
        const e = d.entries?.[0];
        const def = e?.senses?.[0]?.definition || '';
        const ipa = e?.pronunciations?.find((x) => x.type === 'ipa')?.text || '';
        return reply(`📚 *Word of the day*\n\n*${w}*${ipa ? ` ${ipa}` : ''}\n_${e?.partOfSpeech || ''}_\n${def.slice(0, 300)}`);
      } catch { return reply(`📚 *Word of the day*\n\n*${w}*\n\n_Definition abhi nahi mili — thori der baad try karo._`); }
    }
    case 'proverb': {
      return reply(`🗣️ *Kahawat*\n\n${pick(PROVERBS)}`);
    }

    /* ---------------- wiki / knowledge ---------------- */
    case 'wikirandom': {
      try {
        const d = await getJSON('https://en.wikipedia.org/api/rest_v1/page/random/summary');
        return reply(`📚 *${d.title}*\n\n${(d.extract || '').slice(0, 700)}\n\n🔗 ${d.content_urls?.desktop?.page || ''}`);
      } catch { return reply('❌ Wikipedia article nahi mila. Thori der baad try karo.'); }
    }
    case 'onthisday': {
      const key = `${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
      const events = OTD[key] || ['Aaj ke din ki koi khaas info nahi mili.'];
      return reply(`📅 *On this day — ${key}*\n\n${events.map((e) => '• ' + e).join('\n')}`);
    }

    /* ---------------- space ---------------- */
    case 'space': {
      try {
        const d = await getJSON('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY');
        await ctx.send(ctx.from, { image: { url: d.url }, caption: `🌌 *${d.title}*\n\n${(d.explanation || '').slice(0, 600)}` }, { quoted: ctx.m });
      } catch {
        return reply('❌ NASA image nahi mili. Thori der baad try karo.');
      }
      break;
    }
    case 'iss': {
      try {
        const d = await getJSON('https://api.wheretheiss.at/v1/satellites/25544');
        const lat = Number(d.latitude).toFixed(2), lon = Number(d.longitude).toFixed(2);
        return reply(`🛰️ *ISS — live position*\n\n📍 Lat: ${lat}\n📍 Lon: ${lon}\n⚡ Speed: ${Math.round(d.velocity)} km/h\n📏 Altitude: ${Math.round(d.altitude)} km\n\n🗺️ https://maps.google.com/?q=${lat},${lon}`);
      } catch { return reply('❌ ISS position abhi nahi mili. Thori der baad try karo.'); }
    }
    case 'launch': {
      try {
        const d = await getJSON('https://lldev.thespacedevs.com/2.2.0/launch/upcoming/?limit=3');
        const r = (d.results || []).map((x) => `🚀 *${x.name}*\n📅 ${new Date(x.net).toUTCString()}\n📍 ${x.pad?.location?.name || '—'}`).join('\n\n');
        return reply(`🚀 *Upcoming launches*\n\n${r}`);
      } catch { return reply('❌ Launch data nahi mila.'); }
    }

    /* ---------------- speed ---------------- */
    case 'speedtest': {
      const t0 = Date.now();
      const res = await fetch('https://speed.cloudflare.com/__down?bytes=3000000');
      const buf = await res.arrayBuffer();
      const ms = Date.now() - t0;
      const mbps = ((buf.byteLength * 8) / (ms / 1000) / 1e6).toFixed(2);
      return reply(`⚡ *Server speed test*\n\n📥 Download: *${mbps} Mbps*\n📦 ${(buf.byteLength / 1e6).toFixed(1)} MB in ${ms} ms\n\n_(Ye bot ke server ki speed hai)_`);
    }
    default:
      return reply('❓ Unknown info command');
  }
};

module.exports = {
  commands: [
    'urdudict', 'thesaurus', 'rhyme', 'slang', 'wordoftheday', 'proverb', 'wikirandom', 'onthisday',
    'space', 'iss', 'launch', 'speedtest',
    // aliases that belong here
    'synonym', 'define2', 'wotd',
  ],
  category: '📊 INFO',
  handler,
};
