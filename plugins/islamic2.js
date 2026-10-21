/**
 * ISLAMIC2 — 99 names of Allah, prophets, duas, tasbeeh.
 * 100% offline data — no API calls, no credit used.
 */
const config = require('../config');
const { pick } = require('../lib/helpers');

const P = () => config.PREFIX;

/** 99 Names of Allah (Asma ul Husna) with meanings. */
const NAMES = {
  rahman: ['Ar-Rahman', 'The Most Merciful'],
  raheem: ['Ar-Raheem', 'The Most Compassionate'],
  malik: ['Al-Malik', 'The King, The Sovereign'],
  quddus: ['Al-Quddus', 'The Most Holy'],
  salam: ['As-Salam', 'The Source of Peace'],
  mumin: ['Al-Mu\'min', 'The Guarantor of Security'],
  muhaymin: ['Al-Muhaymin', 'The Guardian'],
  aziz: ['Al-Aziz', 'The Almighty'],
  jabbar: ['Al-Jabbar', 'The Compeller'],
  mutakabbir: ['Al-Mutakabbir', 'The Supreme'],
  khaliq: ['Al-Khaliq', 'The Creator'],
  bari: ['Al-Bari', 'The Originator'],
  musawwir: ['Al-Musawwir', 'The Fashioner'],
  ghaffar: ['Al-Ghaffar', 'The All-Forgiving'],
  qahhar: ['Al-Qahhar', 'The Subduer'],
  wahhab: ['Al-Wahhab', 'The Bestower'],
  razzaq: ['Ar-Razzaq', 'The Provider'],
  fattah: ['Al-Fattah', 'The Opener of Ways'],
  alim: ['Al-Alim', 'The All-Knowing'],
  qabid: ['Al-Qabid', 'The Withholder'],
  basit: ['Al-Basit', 'The Extender'],
  khafid: ['Al-Khafid', 'The Reducer'],
  rafi: ['Ar-Rafi', 'The Exalter'],
  muizz: ['Al-Muizz', 'The Honourer'],
  mudhill: ['Al-Mudhill', 'The Dishonourer'],
  sami: ['As-Sami', 'The All-Hearing'],
  basir: ['Al-Basir', 'The All-Seeing'],
  hakam: ['Al-Hakam', 'The Judge'],
  adl: ['Al-Adl', 'The Utterly Just'],
  latif: ['Al-Latif', 'The Subtle, The Gentle'],
  khabir: ['Al-Khabir', 'The All-Aware'],
  halim: ['Al-Halim', 'The Most Forbearing'],
  azim: ['Al-Azim', 'The Magnificent'],
  ghafur: ['Al-Ghafur', 'The Great Forgiver'],
  shakur: ['Ash-Shakur', 'The Most Appreciative'],
  ali: ['Al-Ali', 'The Most High'],
  kabir: ['Al-Kabir', 'The Most Great'],
  hafiz: ['Al-Hafiz', 'The Preserver'],
  muqit: ['Al-Muqit', 'The Sustainer'],
  hasib: ['Al-Hasib', 'The Reckoner'],
  jalil: ['Al-Jalil', 'The Majestic'],
  karim: ['Al-Karim', 'The Most Generous'],
  raqib: ['Ar-Raqib', 'The Watchful'],
  mujib: ['Al-Mujib', 'The Responsive'],
  wasi: ['Al-Wasi', 'The All-Encompassing'],
  hakim: ['Al-Hakim', 'The All-Wise'],
  wadud: ['Al-Wadud', 'The Most Loving'],
  majid: ['Al-Majid', 'The Most Glorious'],
  baith: ['Al-Baith', 'The Resurrector'],
  shahid: ['Ash-Shahid', 'The All-Witnessing'],
  haqq: ['Al-Haqq', 'The Absolute Truth'],
  wakil: ['Al-Wakil', 'The Trustee'],
  qawi: ['Al-Qawi', 'The Most Strong'],
  matin: ['Al-Matin', 'The Firm'],
  wali: ['Al-Wali', 'The Protecting Friend'],
  hamid: ['Al-Hamid', 'The Praiseworthy'],
  muhsi: ['Al-Muhsi', 'The Accounter'],
  mubdi: ['Al-Mubdi', 'The Originator'],
  muid: ['Al-Muid', 'The Restorer'],
  muhyi: ['Al-Muhyi', 'The Giver of Life'],
  mumit: ['Al-Mumit', 'The Bringer of Death'],
  hayy: ['Al-Hayy', 'The Ever-Living'],
  qayyum: ['Al-Qayyum', 'The Self-Subsisting'],
  wajid: ['Al-Wajid', 'The Finder'],
  wahid: ['Al-Wahid', 'The One'],
  ahad: ['Al-Ahad', 'The Unique'],
  samad: ['As-Samad', 'The Eternal Refuge'],
  qadir: ['Al-Qadir', 'The Capable'],
  muqtadir: ['Al-Muqtadir', 'The Omnipotent'],
  muqaddim: ['Al-Muqaddim', 'The Expediter'],
  muakhkhir: ['Al-Muakhkhir', 'The Delayer'],
  awwal: ['Al-Awwal', 'The First'],
  akhir: ['Al-Akhir', 'The Last'],
  zahir: ['Az-Zahir', 'The Manifest'],
  batin: ['Al-Batin', 'The Hidden'],
  mutaali: ['Al-Mutaali', 'The Most Exalted'],
  barr: ['Al-Barr', 'The Source of Goodness'],
  tawwab: ['At-Tawwab', 'The Acceptor of Repentance'],
  muntaqim: ['Al-Muntaqim', 'The Avenger'],
  afuww: ['Al-Afuww', 'The Pardoner'],
  rauf: ['Ar-Rauf', 'The Most Kind'],
  malikulmulk: ['Malik-ul-Mulk', 'Master of the Kingdom'],
  dhuljalal: ['Dhul-Jalali-wal-Ikram', 'Lord of Majesty and Generosity'],
  muqsit: ['Al-Muqsit', 'The Equitable'],
  jami: ['Al-Jami', 'The Gatherer'],
  ghani: ['Al-Ghani', 'The Self-Sufficient'],
  mughni: ['Al-Mughni', 'The Enricher'],
  mani: ['Al-Mani', 'The Preventer'],
  darr: ['Ad-Darr', 'The Distresser'],
  nafi: ['An-Nafi', 'The Benefactor'],
  nur: ['An-Nur', 'The Light'],
  hadi: ['Al-Hadi', 'The Guide'],
  badi: ['Al-Badi', 'The Incomparable Originator'],
  baqi: ['Al-Baqi', 'The Everlasting'],
  warith: ['Al-Warith', 'The Inheritor'],
  rashid: ['Ar-Rashid', 'The Guide to the Right Path'],
  sabur: ['As-Sabur', 'The Most Patient'],
};

/** 25 prophets named in the Quran. */
const PROPHETS = {
  adam: 'Adam (آدم) — the first human and first prophet.',
  idris: 'Idris (إدريس) — known for patience and truthfulness.',
  nuh: 'Nuh (نوح) — built the Ark; preached 950 years.',
  hud: 'Hud (هود) — sent to the people of Ad.',
  salih: 'Salih (صالح) — sent to Thamud; the she-camel miracle.',
  ibrahim: 'Ibrahim (إبراهيم) — Khalilullah, friend of Allah.',
  lut: 'Lut (لوط) — warned the people of Sodom.',
  ismail: 'Ismail (إسماعيل) — son of Ibrahim, helped build the Kaaba.',
  ishaq: 'Ishaq (إسحاق) — son of Ibrahim, father of Yaqoob.',
  yaqub: 'Yaqub (يعقوب) — also called Israel.',
  yusuf: 'Yusuf (يوسف) — dream interpreter, minister of Egypt.',
  ayyub: 'Ayyub (أيوب) — the example of patience.',
  shuaib: 'Shuaib (شعيب) — sent to Madyan.',
  musa: 'Musa (موسى) — Kalimullah; split the sea.',
  harun: 'Harun (هارون) — brother of Musa.',
  dhulkifl: 'Dhul-Kifl (ذو الكفل) — among the patient ones.',
  dawood: 'Dawood (داود) — king and prophet; received Zabur.',
  sulaiman: 'Sulaiman (سليمان) — king over jinn and animals.',
  ilyas: 'Ilyas (إلياس) — called his people to Tawhid.',
  alyasa: 'Al-Yasa (اليسع) — mentioned twice in the Quran.',
  yunus: 'Yunus (يونس) — swallowed by the whale.',
  zakariya: 'Zakariya (زكريا) — father of Yahya.',
  yahya: 'Yahya (يحيى) — cousin of Isa.',
  isa: 'Isa (عيسى) — born miraculously to Maryam.',
  muhammad: 'Muhammad (محمد ﷺ) — the final messenger.',
};

/** Common duas. */
const DUAS = {
  waking: ['Waking up', 'Alhamdulillahil-lazi ahyana ba\'da ma amatana wa ilayhin-nushur'],
  sleep: ['Before sleeping', 'Bismika Allahumma amutu wa ahya'],
  eating: ['Before eating', 'Bismillah'],
  aftereating: ['After eating', 'Alhamdulillahil-lazi at\'amana wa saqana wa ja\'alana minal-muslimin'],
  leaving: ['Leaving home', 'Bismillahi tawakkaltu alallah, wa la hawla wa la quwwata illa billah'],
  toilet: ['Entering toilet', 'Allahumma inni a\'uzu bika minal-khubsi wal-khaba\'is'],
  knowledge: ['Seeking knowledge', 'Rabbi zidni ilma'],
  parents: ['For parents', 'Rabbir-hamhuma kama rabbayani saghira'],
  anxiety: ['Anxiety / distress', 'La ilaha illallahul-Azimul-Halim'],
  guidance: ['Seeking guidance', 'Allahumma inni as\'alukal-huda wat-tuqa wal-afafa wal-ghina'],
  forgiveness: ['Forgiveness', 'Astaghfirullah wa atubu ilayh'],
  travel: ['Travel', 'Subhanal-lazi sakhkhara lana haza wa ma kunna lahu muqrinin'],
  rain: ['Rain', 'Allahumma sayyiban nafi\'a'],
  illness: ['Illness', 'As\'alullahal-Azima Rabbil-Arshil-Azimi an yashfiyak'],
  exam: ['Before exam', 'Rabbi ishrah li sadri wa yassir li amri'],
};

const handler = async (ctx) => {
  const { command, arg, reply } = ctx;

  // --- per-item aliases: .name_rahman / .prophet_adam / .dua_sleep ---
  // These are registered as real commands, so they MUST reply (they used to
  // fall through silently). Each forwards to its data card.
  if (command.startsWith('name_')) {
    const key = command.slice(5);
    if (NAMES[key]) {
      const [ar, en] = NAMES[key];
      return reply(`✨ *${ar}*\n━━━━━━━━━━━━━━━\n▪️ Meaning: ${en}\n▪️ Total names: ${Object.keys(NAMES).length}\n\n_${P()}names list — sab dekhne ke liye_`);
    }
  }
  if (command.startsWith('prophet_')) {
    const key = command.slice(8);
    if (PROPHETS[key]) return reply(`🕌 *Prophet*\n━━━━━━━━━━━━━━━\n${PROPHETS[key]}`);
  }
  if (command.startsWith('dua_')) {
    const key = command.slice(4);
    if (DUAS[key]) {
      const [title, text] = DUAS[key];
      return reply(`🤲 *${title}*\n━━━━━━━━━━━━━━━\n_${text}_`);
    }
  }

  // --- 99 names: .name99 rahman  OR  .names  (random) ---
  if (command === 'name99' || command === 'names') {
    const key = String(arg || '').toLowerCase().replace(/[^a-z]/g, '');
    if (key && NAMES[key]) {
      const [ar, en] = NAMES[key];
      return reply(`✨ *${ar}*\n━━━━━━━━━━━━━━━\n▪️ Meaning: ${en}\n▪️ Total names: ${Object.keys(NAMES).length}\n\n_${P()}names list — sab dekhne ke liye_`);
    }
    if (key && !NAMES[key]) {
      const hits = Object.keys(NAMES).filter((k) => k.includes(key));
      if (hits.length) return reply(`🔍 Mil gaye:\n${hits.map((h) => `▪️ \`${P()}name99 ${h}\` — ${NAMES[h][0]}`).join('\n')}`);
      return reply(`❌ \`${arg}\` nahi mila. \`${P()}names list\` try karo.`);
    }
    const k = pick(Object.keys(NAMES));
    const [ar, en] = NAMES[k];
    return reply(`✨ *${ar}*\n━━━━━━━━━━━━━━━\n▪️ Meaning: ${en}\n\n_${P()}names list — poore 99_`);
  }

  if (command === 'nameslist') {
    const list = Object.entries(NAMES);
    return reply(
      `✨ *99 NAMES OF ALLAH*\n━━━━━━━━━━━━━━━\n` +
      list.map(([k, [ar, en]], i) => `${i + 1}. *${ar}* — ${en}\n   \`${P()}name99 ${k}\``).join('\n')
    );
  }

  // --- prophets ---
  if (command === 'prophet') {
    const key = String(arg || '').toLowerCase().replace(/[^a-z]/g, '');
    if (key && PROPHETS[key]) return reply(`🕌 *Prophet*\n━━━━━━━━━━━━━━━\n${PROPHETS[key]}`);
    if (key) {
      const hits = Object.keys(PROPHETS).filter((k) => k.includes(key));
      if (hits.length) return reply(`🔍 ${hits.map((h) => `\`${P()}prophet ${h}\``).join(' | ')}`);
    }
    return reply(`🕌 *PROPHETS (25)*\n━━━━━━━━━━━━━━━\n${Object.keys(PROPHETS).map((k) => `▪️ \`${P()}prophet ${k}\``).join('\n')}`);
  }

  // --- duas ---
  if (command === 'dua') {
    const key = String(arg || '').toLowerCase().replace(/[^a-z]/g, '');
    if (key && DUAS[key]) {
      const [title, text] = DUAS[key];
      return reply(`🤲 *${title}*\n━━━━━━━━━━━━━━━\n_${text}_`);
    }
    if (key) {
      const hits = Object.keys(DUAS).filter((k) => k.includes(key));
      if (hits.length) return reply(`🔍 ${hits.map((h) => `\`${P()}dua ${h}\``).join(' | ')}`);
    }
    return reply(`🤲 *DUAS*\n━━━━━━━━━━━━━━━\n${Object.keys(DUAS).map((k) => `▪️ \`${P()}dua ${k}\` — ${DUAS[k][0]}`).join('\n')}`);
  }
};

module.exports = {
  // `.dua` is owned by islamic.js; here we only expose the per-dua aliases
  // (`dua_sleep`, `dua_waking`, …) so the two plugins never collide.
  commands: [
    'name99', 'names', 'nameslist', 'prophet',
    ...Object.keys(NAMES).map((k) => `name_${k}`),
    ...Object.keys(PROPHETS).map((k) => `prophet_${k}`),
    ...Object.keys(DUAS).map((k) => `dua_${k}`),
  ],
  category: '🕌 ISLAMIC',
  handler,
};
