/**
 * ISLAMIC — Deen commands (Quran, hadith, prayer, duas, zakat…)
 * All data from free public APIs (alquran.cloud, aladhan, hadith-api CDN).
 */
const config = require('../config');
const { getJSON, getText, pick, randInt } = require('../lib/helpers');

const P = () => config.PREFIX;
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * Prayer timings from aladhan, but never let a flaky/empty API response crash a
 * command. Returns the timings object, or null when the lookup fails.
 */
async function safeTimings(city) {
  try {
    const d = await getJSON(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=PK&method=1`, {}, 15000);
    const t = d?.data?.timings;
    return t && t.Fajr ? t : null;
  } catch { return null; }
}

/* ---- hadith: fawazahmed0/hadith-api on jsDelivr ---- */
const HADITH_BOOKS = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah'];
async function randomHadith(book) {
  const b = HADITH_BOOKS.includes(book) ? book : pick(HADITH_BOOKS);
  const sec = randInt(1, 40);
  const d = await getJSON(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/eng-${b}/sections/${sec}.json`);
  const list = d?.hadiths || [];
  if (!list.length) throw new Error('empty');
  const h = pick(list);
  return { book: d?.metadata?.name || b, no: h.hadithnumber, text: clean(h.text) };
}

/* ---- quran ---- */
async function ayah(ref) {
  const d = await getJSON(`https://api.alquran.cloud/v1/ayah/${encodeURIComponent(ref)}/editions/quran-uthmani,en.sahih,ur.jalandhry`);
  const [ar, en, ur] = d.data;
  return { ar: ar.text, en: en.text, ur: ur.text, ref: `${ar.surah.englishName} ${ar.numberInSurah}:${ar.surah.number}` };
}

const KAABA = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Kaaba_Masjid_Haraam_Makkah.jpg/640px-Kaaba_Masjid_Haraam_Makkah.jpg';
const MADINAH = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Al-Masjid_an-Nabawi.jpg/640px-Al-Masjid_an-Nabawi.jpg';

const AZKAR = [
  ['SubhanAllah', 'سُبْحَانَ اللّٰه', 'Allah pak hai — 33x'],
  ['Alhamdulillah', 'اَلْحَمْدُ لِلّٰه', 'Sab tareef Allah ke liye — 33x'],
  ['Allahu Akbar', 'اَللّٰهُ أَكْبَر', 'Allah sab se bara — 34x'],
  ['La ilaha illallah', 'لَا إِلٰهَ إِلَّا اللّٰه', 'Allah ke siwa koi ibadat ke laiq nahi'],
  ['Astaghfirullah', 'أَسْتَغْفِرُ اللّٰه', 'Allah se maafi mango — 100x'],
  ['La hawla wa la quwwata illa billah', 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللّٰه', 'Taakat sirf Allah se hai'],
];
const DUA = {
  sabr: 'رَبَّنَا أَفْرِغْ عَلَيْنَا صَبْرًا وَثَبِّتْ أَقْدَامَنَا\n_”Aey hamare Rab! hum par sabr nazil farma aur hamare qadam saabit rakh.“_ (2:250)',
  shukr: 'وَإِذْ تَأَذَّنَ رَبُّكُمْ لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ\n_”Agar tum shukr karoge to main tumhe aur zyada dunga.“_ (14:7)',
  nazar: 'أَعُوذُ بِكَلِمَاتِ اللّٰهِ التَّامَّاتِ مِنْ كُلِّ شَيْطَانٍ وَهَامَّةٍ وَمِنْ كُلِّ عَيْنٍ لَامَّةٍ\n_Nazar ke liye ye dua parho (Bukhari)._',
  tawbah: 'رَبِّ اغْفِرْ لِي وَتُبْ عَلَيَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ\n_”Aey mere Rab! mujhe bakhsh de aur meri tawbah qubool farma.“_',
  safar: 'سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ\n_Safar ki dua — safar shuru karte waqt parho._',
  khana: 'بِسْمِ اللّٰهِ وَعَلَى بَرَكَةِ اللّٰهِ\n_Khana shuru karte waqt._',
  sona: 'اللّٰهُمَّ بِاسْمِكَ أَمُوتُ وَأَحْيَا\n_Sone se pehle._',
  uthna: 'الْحَمْدُ لِلّٰهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ\n_Neend se uthne par._',
  istikhara: 'اللّٰهُمَّ إِنِّي أَسْتَخِيرُكَ بِعِلْمِكَ وَأَسْتَقْدِرُكَ بِقُدْرَتِكَ\n_Istikhara ki dua — namaz ke baad parho, phir dil ki taraf dekho._',
  jummah: 'اللّٰهُمَّ أَصْلِحْ لِي دِينِي الَّذِي هُوَ عِصْمَةُ أَمْرِي\n_Jummah ke din kasrat se durood parho aur ye dua karo._',
};
const KALIMA = [
  ['1st Kalima (Tayyab)', 'لَا إِلٰهَ إِلَّا اللّٰهُ مُحَمَّدٌ رَسُولُ اللّٰهِ'],
  ['2nd Kalima (Shahadat)', 'أَشْهَدُ أَنْ لَا إِلٰهَ إِلَّا اللّٰهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ'],
  ['3rd Kalima (Tamjeed)', 'سُبْحَانَ اللّٰهِ وَالْحَمْدُ لِلّٰهِ وَلَا إِلٰهَ إِلَّا اللّٰهُ وَاللّٰهُ أَكْبَرُ'],
  ['4th Kalima (Tawheed)', 'لَا إِلٰهَ إِلَّا اللّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ'],
  ['5th Kalima (Istighfar)', 'أَسْتَغْفِرُ اللّٰهَ رَبِّي مِنْ كُلِّ ذَنْبٍ وَأَتُوبُ إِلَيْهِ'],
  ['6th Kalima (Radd-e-Kufr)', 'اللّٰهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ أَنْ أُشْرِكَ بِكَ شَيْئًا'],
];
const ISLAMIC_Q = [
  ['Quran me kitni surah hain?', '114'],
  ['Sab se lambi surah kaunsi hai?', 'Al-Baqarah (2)'],
  ['Namaz me kitni rakats farz hain (5 waqt milakar)?', '17'],
  ['Pehle khalifa kaun thay?', 'Abu Bakr Siddique (RA)'],
  ['Quran kis mahine me nazil hona shuru hua?', 'Ramadan'],
  ['Sab se pehli masjid kaunsi hai?', 'Masjid al-Haram (Makkah)'],
  ['Zakat kitne percent hai?', '2.5% (40 me 1)'],
  ['Hajj kis mahine me hota hai?', 'Zil-Hijjah'],
];

const handler = async (ctx) => {
  const { command, reply, arg } = ctx;

  switch (command) {
    /* ---------------- QURAN ---------------- */
    case 'ayat': {
      try {
        const d = await getJSON('https://api.quran.com/api/v4/verses/random?translations=158&fields=text_uthmani');
        const v = d.verse;
        return reply(`📖 *Ayah of the day*\n\n${v.text_uthmani}\n\n_${clean(v.translations?.[0]?.text)}_\n\n— ${v.verse_key}`);
      } catch { return reply('❌ Ayah abhi nahi mili. Thori der baad try karo.'); }
    }
    case 'quran': case 'tafsir': {
      if (!arg) return reply(`❌ Surah:ayah do. Example: ${P()}quran 2:255`);
      const ref = arg.trim().replace('-', ':');
      const a = await ayah(ref);
      const head = command === 'tafsir' ? `📚 *Tafsir — ${a.ref}*` : `📖 *${a.ref}*`;
      return reply(`${head}\n\n${a.ar}\n\n🇬🇧 ${a.en}\n\n🇵🇰 ${a.ur}`);
    }
    case 'surah': {
      if (!arg) return reply(`❌ Surah number do (1-114). Example: ${P()}surah 36`);
      const n = parseInt(arg, 10);
      if (!(n >= 1 && n <= 114)) return reply('❌ Surah number 1 se 114 ke darmiyan ho.');
      const d = await getJSON(`https://api.alquran.cloud/v1/surah/${n}/editions/quran-uthmani,ur.jalandhry`);
      const [ar, ur] = d.data;
      const ayahs = ar.ayahs.slice(0, 5);
      const body = ayahs.map((x) => `${x.numberInSurah}. ${x.text}`).join('\n\n');
      await reply(`📖 *Surah ${ar.englishName} (${ar.name})*\n${ar.numberOfAyahs} ayahs — Makki/Madani: ${ar.revelationType}\n\n${body}\n\n_…baqi ${Math.max(0, ar.numberOfAyahs - 5)} ayahs._\n🇵🇰 ${clean(ur.ayahs[0].text)}`);
      break;
    }
    case 'quransearch': case 'qsearch': {
      if (!arg) return reply(`❌ Lafz do. Example: ${P()}quransearch sabr`);
      const d = await getJSON(`https://api.quran.com/api/v4/search?q=${encodeURIComponent(arg)}&size=3&language=en`);
      const r = d.search?.results || [];
      if (!r.length) return reply('❌ Kuch nahi mila.');
      return reply(`🔎 *Quran search — “${arg}”*\n\n` + r.map((x) => `📖 *${x.verse_key}*\n${clean(x.text)}\n_${clean(x.translations?.[0]?.text)}_`).join('\n\n'));
    }
    case 'qaudio': {
      if (!arg) return reply(`❌ Surah ya surah:ayah do. Example: ${P()}qaudio 36`);
      const ref = arg.trim().replace('-', ':');
      const url = ref.includes(':')
        ? (await getJSON(`https://api.alquran.cloud/v1/ayah/${encodeURIComponent(ref)}/ar.alafasy`)).data.audio
        : (await getJSON(`https://api.alquran.cloud/v1/surah/${parseInt(ref, 10)}/ar.alafasy`)).data.ayahs[0].audio;
      if (!url) return reply('❌ Audio nahi mila.');
      await ctx.send(ctx.from, { audio: { url }, mimetype: 'audio/mpeg', ptt: false }, { quoted: ctx.m });
      break;
    }

    /* ---------------- HADITH ---------------- */
    case 'hadith': {
      try {
        const h = await randomHadith(arg ? arg.toLowerCase() : null);
        return reply(`📜 *${h.book} — Hadith #${h.no}*\n\n${h.text}`);
      } catch { return reply('❌ Hadith abhi nahi mili. Thori der baad try karo.'); }
    }
    case 'sahaba': {
      const names = ['Abu Bakr Siddique (RA)', 'Umar Farooq (RA)', 'Usman Ghani (RA)', 'Ali (RA)', 'Bilal (RA)', 'Salman Farsi (RA)', 'Khalid bin Waleed (RA)', 'Ayesha (RA)', 'Fatima (RA)', 'Hamza (RA)'];
      const who = pick(names);
      try {
        const h = await randomHadith('bukhari');
        return reply(`⭐ *${who}*\n\n📜 ${h.book} #${h.no}\n${h.text}`);
      } catch { return reply(`⭐ *${who}*\n\n_Is sahabi ke baare me hadith abhi nahi mili — thori der baad try karo._`); }
    }

    /* ---------------- PRAYER / TIME ---------------- */
    case 'salahtimer': case 'namaz': {
      const city = arg || 'Karachi';
      const t = await safeTimings(city);
      if (!t) return reply(`❌ *${city}* ke timings nahi mil sake — API masla hy. Thori der baad try karo.`);
      const now = new Date();
      const hhmm = (s) => { const [h, m] = s.split(':').map(Number); const x = new Date(now); x.setHours(h, m, 0, 0); return x; };
      const next = Object.entries({ Fajr: t.Fajr, Dhuhr: t.Dhuhr, Asr: t.Asr, Maghrib: t.Maghrib, Isha: t.Isha })
        .map(([k, v]) => [k, hhmm(v)]).sort((a, b) => a[1] - b[1])
        .find(([, dt]) => dt > now);
      const mins = next ? Math.round((next[1] - now) / 60000) : null;
      return reply(`🕌 *Namaz timings — ${city}*\n\n🌅 Fajr: ${t.Fajr}\n☀️ Dhuhr: ${t.Dhuhr}\n🌤️ Asr: ${t.Asr}\n🌇 Maghrib: ${t.Maghrib}\n🌙 Isha: ${t.Isha}\n\n⏳ Agli namaz: *${next ? next[0] : '—'}*${mins !== null ? ` (${Math.floor(mins / 60)}h ${mins % 60}m baad)` : ''}`);
    }
    case 'imsak': case 'sehri': {
      const city = arg || 'Karachi';
      const t = await safeTimings(city);
      if (!t) return reply(`❌ *${city}* ke timings nahi mil sake — API masla hy. Thori der baad try karo.`);
      return reply(`🌙 *Sehri / Iftar — ${city}*\n\n🌅 Sehri (Fajr): ${t.Fajr}\n🌇 Iftar (Maghrib): ${t.Maghrib}\n\n_Allah hamare roze qubool farmaye._`);
    }
    case 'tahajjud': {
      const city = arg || 'Karachi';
      const t = await safeTimings(city);
      if (!t) return reply(`❌ *${city}* ke timings nahi mil sake — API masla hy. Thori der baad try karo.`);
      return reply(`🌌 *Tahajjud — ${city}*\n\nRaat ka aakhri hissa (Fajr se pehle) — best waqt: *${t.Fajr}* se ~1 ghanta pehle.\n\n_Nabi ﷺ ne farmaya: “Raat ke aakhri hisse me Allah bandon ki dua qubool farmata hai.”_`);
    }
    case 'hijri': {
      let d; try { d = await getJSON('https://api.aladhan.com/v1/gToH', {}, 15000); } catch { d = null; }
      const h = d?.data?.hijri;
      if (!h) return reply('❌ Hijri date nahi mil saki — API masla hy. Thori der baad try karo.');
      return reply(`🌙 *Hijri date*\n\n${h.day} ${h.month.en} ${h.year} AH\n_(${h.weekday.en})_\n\nMiladi: ${d.data.gregorian.date}`);
    }
    case 'qibla': {
      const city = arg || 'Karachi';
      const g = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`).catch(() => null);
      const c = g?.results?.[0];
      if (!c) return reply('❌ City nahi mili.');
      const d = await getJSON(`https://api.aladhan.com/v1/qibla/${c.latitude}/${c.longitude}`, {}, 15000).catch(() => null);
      const dir = d?.data?.direction;
      if (dir == null) return reply('❌ Qibla direction nahi mil saki — API masla hy. Thori der baad try karo.');
      return reply(`🧭 *Qibla direction — ${c.name}*\n\n📐 *${Number(dir).toFixed(1)}°* from North\n_(compass app me is angle par set karo)_`);
    }
    case 'dua': {
      const key = (arg || '').toLowerCase().trim();
      if (key && DUA[key]) return reply(`🤲 *Dua — ${key}*\n\n${DUA[key]}`);
      return reply(`🤲 *Duain*\n\n` + Object.keys(DUA).map((k) => `• ${P()}dua ${k}`).join('\n'));
    }
    case 'azkar': {
      const a = pick(AZKAR);
      return reply(`📿 *Zikr*\n\n${a[1]}\n*${a[0]}*\n_${a[2]}_`);
    }
    case 'asma': {
      const d = await getJSON('https://api.aladhan.com/v1/asmaAlHusna', {}, 15000).catch(() => null);
      const list = d?.data;
      if (!Array.isArray(list) || !list.length) return reply('❌ Asma-ul-Husna list nahi mil saki — API masla hy.');
      if (arg) {
        const n = parseInt(arg, 10);
        const a = list.find((x) => Number(x.number) === n) || pick(list);
        return reply(`✨ *${a.transliteration}*\n\n${a.name}\n\n_${a.en?.meaning || ''}_`);
      }
      return reply(`✨ *Allah ke 99 naam*\n\n` + list.slice(0, 20).map((x) => `${x.number}. ${x.transliteration}`).join('\n') + `\n\n_${P()}asma <number> — poora naam + matlab_`);
    }
    case 'kalima': {
      const k = arg ? KALIMA.find((x) => x[0].toLowerCase().includes(arg.toLowerCase())) : pick(KALIMA);
      const item = k || KALIMA[0];
      return reply(`🕋 *${item[0]}*\n\n${item[1]}`);
    }
    case 'durood': {
      return reply(`ﷺ *Durood*\n\nاللّٰهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ\n\n_”Aey Allah! Muhammad ﷺ aur unki aal par rehmat nazil farma.“_\n\n💚 Jummah ke din kasrat se parho — 100x ka wada hai.`);
    }
    case 'zikr': {
      const a = pick(AZKAR);
      return reply(`📿 *Aaj ka zikr*\n\n${a[1]}\n*${a[0]}*\n_${a[2]}_\n\n${P()}tasbih — counter ke liye`);
    }
    case 'tasbih': {
      const n = parseInt(arg, 10) || 33;
      return reply(`📿 *Tasbih counter*\n\nTarget: *${n}x*\n\n` + '▫️'.repeat(Math.min(n, 33)) + `\n\n_Zabani ginti karo — ${P()}zikr se zikr dekho._`);
    }
    case 'khatma': {
      const n = Math.min(parseInt(arg, 10) || 0, 604);
      const pct = ((n / 604) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(n / 604 * 20)) + '░'.repeat(20 - Math.round(n / 604 * 20));
      return reply(`📖 *Quran Khatma tracker*\n\n${bar} ${pct}%\nPages: *${n} / 604*\n\n${P()}khatma <page> — update karo`);
    }
    case 'sunnah': {
      const s = pick([
        'Miswak karna — Nabi ﷺ ne farmaya: “Miswak munh ki safai aur Rab ki khushi ka zariya hai.”',
        'Khane se pehle Bismillah, baad me Alhamdulillah.',
        'Daayein haath se khana aur peena.',
        'Sote waqt wudu karna.',
        'Salam ko aam karna.',
        'Baith kar pani peena.',
        'Jummah ke din ghusl karna aur safed kapre pehnna.',
        'Kisi ke ghar jaane se pehle 3 martaba ijazat lena.',
      ]);
      return reply(`🌟 *Aaj ki Sunnah*\n\n${s}`);
    }
    case 'islamicq': {
      const [q, a] = pick(ISLAMIC_Q);
      return reply(`🕌 *Islamic Quiz*\n\n❓ ${q}\n\n_Jawab soch kar likho, phir ${P()}islamicq dobara — jawab aayega._\n\n||Jawab: ${a}||`);
    }
    case 'jummah': {
      const t = await safeTimings(arg || 'Karachi');
      if (!t) return reply(`❌ Timings nahi mil sake — API masla hy. Thori der baad try karo.`);
      return reply(`🕌 *Jummah*\n\nKhutbah waqt (Dhuhr): *${t.Dhuhr}*\n\n📌 Sunnatein: ghusl, miswak, safed kapre, jaldi masjid jana, kasrat se durood, Surah Kahf parhna.\n\n${DUA.jummah}`);
    }
    case 'janazah': {
      return reply(`🕊️ *Namaz-e-Janazah*\n\n• 4 takbeerein — koi ruku/sajda nahi\n• 1st: Subhanakallah\n• 2nd: Durood-e-Ibrahim\n• 3rd: Mayyit ke liye dua\n• 4th: Salam\n\nMayyit ko qibla rukh rakha jata hai. Janazah namaz farz-e-kifaya hai.`);
    }
    case 'wudu': {
      return reply(`💧 *Wudu ka tareeqa*\n\n1. Niyyat + Bismillah\n2. Dono haath 3x (kalai tak)\n3. Miswak / munh 3x\n4. Naak 3x\n5. Munh 3x\n6. Dono haath kohni tak 3x\n7. Sar ka masah 1x\n8. Kaan 1x\n9. Dono paanv takhnon tak 3x\n\nFarz: 4 (munh, haath, sar masah, paanv)`);
    }
    case 'roza': {
      return reply(`🌙 *Roze ke masail*\n\n✅ Roza todne wale: khana, peena, jima, jaan-boojh kar qai.\n❌ Roza na todne wale: bhool kar khana/peena, khwab me ehtilam, miswak, khoon donation (thoda), ghusl.\n\nQaza: 1 roza = 1 qaza. Kaffara: 60 roze ya 60 miskeen ko khana.`);
    }
    case 'zakat': {
      const n = parseFloat(String(arg).replace(/[^0-9.]/g, ''));
      if (!n) return reply(`❌ Raqam do. Example: ${P()}zakat 500000`);
      const z = n * 0.025;
      return reply(`💰 *Zakat calculator*\n\nAssets: PKR ${n.toLocaleString()}\nNisab check: PKR ${(n >= 135000 ? '✅ poora hua' : '❌ poora nahi hua (silver nisab ~135k)')}\n\n*Zakat (2.5%): PKR ${z.toLocaleString(undefined, { maximumFractionDigits: 2 })}*`);
    }
    case 'fitrana': {
      const p = parseFloat(String(arg).replace(/[^0-9.]/g, '')) || 0;
      return reply(`💰 *Fitrana*\n\nAam rate: *PKR 250–300* per person (aata/khajoor ke hisaab se).\n${p ? `Aap ke ghar (${p} afraad): *PKR ${(p * 275).toLocaleString()}* (avg 275/person)\n` : ''}\nEid ki namaz se pehle ada karna wajib hai.`);
    }
    case 'sadqa': {
      return reply(`🤲 *Sadqa*\n\nNabi ﷺ: “Sadqa bala ko taalta hai aur umar barhata hai.”\n\n• Rozana thora sadqa karo\n• Chhupa kar dena behtar hai\n• Musibat me sadqa karo\n\n${P()}fitrana — fitrana calculator`);
    }
    case 'eid': {
      let d; try { d = await getJSON('https://api.aladhan.com/v1/gToH', {}, 15000); } catch { d = null; }
      const g = d?.data?.gregorian, h = d?.data?.hijri;
      if (!g || !h) return reply('❌ Date nahi mil saki — API masla hy. Thori der baad try karo.');
      return reply(`🎉 *Eid*\n\nMiladi: ${g.date}\nHijri: ${h.day} ${h.month.en} ${h.year}\n\n_Eid Mubarak! 🌙_\n\n${P()}salahtimer — Eid namaz ka waqt`);
    }
    case 'kaaba': {
      await ctx.send(ctx.from, { image: { url: KAABA }, caption: '🕋 *Kaaba — Masjid al-Haram, Makkah*' }, { quoted: ctx.m });
      break;
    }
    case 'madinah': {
      await ctx.send(ctx.from, { image: { url: MADINAH }, caption: '🕌 *Masjid an-Nabawi — Madinah Munawwara*' }, { quoted: ctx.m });
      break;
    }
    case 'nasheed': {
      const list = ['Tala Al Badru Alayna', 'Maula Ya Salli', 'Assalamu Alayka', 'Hasbi Rabbi', 'Allah Hoo'];
      return reply(`🎵 *Islamic nasheed*\n\n*${pick(list)}*\n\n_YouTube par search karo — ${P()}ytvideo <naam> se bhi dl ho sakta hai._`);
    }
    case 'istikhara': {
      return reply(`🕌 *Istikhara*\n\n${DUA.istikhara}\n\n📌 Tareeqa: 2 rakat nafl parho, phir ye dua parho. Jo dil me asaani ho — usi par amal karo. Nabi ﷺ ne farmaya: “Jo istikhara kare wo kabhi naadim nahi hota.”`);
    }
    case 'tawbah': return reply(`🤲 *Tawbah*\n\n${DUA.tawbah}\n\n_Allah Tawwab-o-Raheem hai — dil se maafi mango, wo maaf farmata hai._`);
    case 'sabr': return reply(`🌿 *Sabr*\n\n${DUA.sabr}`);
    case 'shukr': return reply(`🌿 *Shukr*\n\n${DUA.shukr}`);
    case 'nazar': return reply(`🧿 *Nazar*\n\n${DUA.nazar}`);
    case 'ruqyah': {
      return reply(`🩺 *Ruqyah*\n\n• Surah Fatiha 7x\n• Ayat-ul-Kursi 3x\n• Surah Falaq 3x\n• Surah Naas 3x\n\nApne ya kisi ke upar haath rakh kar parho, dam karo.\n\n${DUA.nazar}`);
    }
    case 'umrah': {
      return reply(`🕋 *Umrah guide*\n\n1. Ihram (miqat par niyyat)\n2. Tawaf — 7 chakkar\n3. Sa'i — Safa/Marwa 7 chakkar\n4. Halq/Taqseer — baal\n\n📌 Documents: passport (6+ months), visa, ticket, vaccination card.\n_Umrah packages ke liye travel agent se rabta karo._`);
    }
    case 'hajj': {
      return reply(`🕋 *Hajj*\n\n• 8 Zil-Hijjah: Mina\n• 9 Zil-Hijjah: Arafah (sab se aham)\n• 10 Zil-Hijjah: Muzdalifah, Rami, Qurbani, Halq, Tawaf-uz-Ziyarah\n• 11–13: Mina me Rami\n\nFarz: Ihram, Arafah, Tawaf-uz-Ziyarah.`);
    }
    case 'mosque': {
      const city = arg || 'Karachi';
      return reply(`🕌 *Masjid — ${city}*\n\nGoogle Maps par search karo: *mosque near ${city}*\n\nYa ${P()}map ${city} mosque — location link ke liye.`);
    }
    case 'ramadan': {
      const city = arg || 'Karachi';
      const t = await safeTimings(city);
      if (!t) return reply(`❌ *${city}* ke timings nahi mil sake — API masla hy. Thori der baad try karo.`);
      return reply(`🌙 *Ramadan — ${city}*\n\n🌅 Sehri: ${t.Fajr}\n🌇 Iftar: ${t.Maghrib}\n\n_Allah sab ke roze qubool farmaye._`);
    }
    default:
      return reply('❓ Unknown islamic command');
  }
};

module.exports = {
  commands: [
    'hadith', 'qibla', 'asma', 'hijri', 'azkar', 'tasbih', 'khatma', 'salahtimer', 'ayat', 'zikr',
    'istikhara', 'janazah', 'wudu', 'imsak', 'sahaba', 'islamicq', 'tahajjud', 'jummah', 'kaaba', 'madinah',
    'tawbah', 'sabr', 'shukr', 'nazar', 'ruqyah', 'nasheed', 'durood', 'kalima', 'sunnah', 'fitrana',
    'sadqa', 'roza', 'eid',
    // extras that belong in this family
    'quran', 'tafsir', 'qaudio', 'quransearch', 'dua', 'namaz', 'sehri', 'zakat', 'mosque', 'ramadan',
  ],
  category: '🕌 ISLAMIC',
  handler,
};
