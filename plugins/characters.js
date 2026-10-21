/**
 * CHARACTERS — role/character commands + DP commands + rating commands
 * --------------------------------------------------------------------
 * Fixes:
 *  - mentions now use the *resolved* JID (LID → real number). No more fake
 *    numbers like `+212223345675336` leaking into mentions.
 *  - `.fool` now marks the *target* (the person you reply to / tag) as the fool,
 *    never the sender.
 *  - expanded role + rating + fun command set.
 */
const config = require('../config');
const { getJSON, pick, randInt, targetOf } = require('../lib/helpers');
const contacts = require('../lib/contacts');

// role -> [emoji, line]
const ROLES = {
  dad: ['👨', 'tumhara *BAAP* hy! 😎'],
  abba: ['👨', 'tumhara *ABBA* hy! 😎'],
  mom: ['👩', 'tumhari *AMMI* hy! 🥰'],
  ammi: ['👩', 'tumhari *AMMI* hy! 🥰'],
  son: ['👦', 'tumhara *BETA* hy! 😄'],
  daughter: ['👧', 'tumhari *BETI* hy! 🌸'],
  boyfriend: ['💑', 'tumhara *BOYFRIEND* hy! 😍'],
  girlfriend: ['💏', 'tumhari *GIRLFRIEND* hy! 🥰'],
  twin: ['👯', 'tumhara *JUDAWA* hy! 😲'],
  partner: ['🤝', 'tumhara *PARTNER* hy! 💪'],
  bodyguard: ['🛡️', 'tumhara *BODYGUARD* hy! 🥷'],
  boss: ['💼', 'tumhara *BOSS* hy! 😎'],
  employee: ['🧑‍💼', 'tumhara *EMPLOYEE* hy! 📋'],
  pet: ['🐾', 'tumhara *PALTOO* hy! 🐶'],
  servant: ['🧹', 'tumhara *NAUKAR* hy! 😅'],
  idol: ['🌟', 'tumhara *IDOL* hy! 🤩'],
  fan: ['📣', 'tumhara *FAN* hy! 🥳'],
  ghost: ['👻', 'tumhara *BHOOT* hy! 😱'],
  angel: ['😇', 'tumhara *FARISHTA* hy! ✨'],
  devil: ['😈', 'tumhara *SHAITAN* hy! 🔥'],
  king: ['👑', 'tumhara *KING* hy! 🤴'],
  queen: ['👸', 'tumhari *QUEEN* hy! 💃'],
  slave: ['⛓️', 'tumhara *GULAM* hy! 😆'],
  master: ['🧙', 'tumhara *MASTER* hy! 🔮'],
  rich: ['💰', 'tumhara *AMEER* dost hy! 🤑'],
  poor: ['🪙', 'tumhara *GAREEB* dost hy! 😢'],
  bhai: ['🤝', 'tumhara *BHAI* hy! 💪'],
  bahan: ['👧', 'tumhari *BEHN* hy! 🌸'],
  wife: ['👰', 'tumhari *BIWI* hy! 💍'],
  husband: ['🤵', 'tumhara *SHOHAR* hy! 💍'],
  chacha: ['🧔', 'tumhara *CHACHA* hy! 😎'],
  chachi: ['👩', 'tumhari *CHACHI* hy! 😄'],
  nana: ['👴', 'tumhara *NANA* hy! 👑'],
  nani: ['👵', 'tumhari *NANI* hy! 🥰'],
  mama: ['🧑', 'tumhara *MAMA* hy! 😁'],
  mami: ['👩', 'tumhari *MAMI* hy! 😊'],
  bestfriend: ['🫂', 'tumhara *BEST FRIEND* hy! 💯'],
  enemy: ['⚔️', 'tumhara *DUSHMAN* hy! 😠'],
  crush: ['💘', 'tumhara *CRUSH* hy! 😳'],
  teacher: ['👨‍🏫', 'tumhara *USTAD* hy! 📚'],
  student: ['🎒', 'tumhara *STUDENT* hy! ✏️'],
  rival: ['🥊', 'tumhara *RIVAL* hy! 🔥'],
  runmureed: ['🕋', 'tumhara *ROOHANI MUREED* hy! 🤲'],
  cosplay: ['🎭', 'tumhara *COSPLAY* partner hy! ✨'],
  seth: ['🏦', 'tumhara *SETH* hy! 💸'],
  ustad: ['🎓', 'tumhara *USTAD* hy! 🧠'],
  malik: ['👑', 'tumhara *MALIK* hy! 😼'],
  dost: ['🫂', 'tumhara *DOST* hy! 😄'],
  yaar: ['🤙', 'tumhara *YAAR* hy! 😎'],
  cousin: ['🧑‍🤝‍🧑', 'tumhara *COUSIN* hy! 😁'],
  khala: ['👩', 'tumhari *KHALA* hy! 😊'],
  phuphi: ['👩', 'tumhari *PHUPHI* hy! 😄'],
  saas: ['👩‍🦳', 'tumhari *SAAS* hy! 😬'],
  sasur: ['👨‍🦳', 'tumhara *SASUR* hy! 😅'],
  bhabhi: ['👩', 'tumhari *BHABHI* hy! 😍'],
  devar: ['🧑', 'tumhara *DEVAR* hy! 😜'],
  jeth: ['🧑', 'tumhara *JETH* hy! 😏'],
  classmate: ['🧑‍🎓', 'tumhara *CLASSMATE* hy! 📝'],
  colleague: ['🧑‍💻', 'tumhara *COLLEAGUE* hy! 💼'],
  neighbor: ['🏠', 'tumhara *PADOSI* hy! 👋'],
  player: ['🎮', 'tumhara *PLAYER* hy! 🕹️'],
  coach: ['📣', 'tumhara *COACH* hy! 🏋️'],
  doctor: ['🩺', 'tumhara *DOCTOR* hy! 💊'],
  lawyer: ['⚖️', 'tumhara *WAKEEL* hy! 📜'],
  police: ['👮', 'tumhara *POLICE* hy! 🚨'],
  soldier: ['🪖', 'tumhara *SOLDIER* hy! 🎖️'],
  pilot: ['✈️', 'tumhara *PILOT* hy! 🛫'],
  chef: ['👨‍🍳', 'tumhara *CHEF* hy! 🍳'],
  driver: ['🚗', 'tumhara *DRIVER* hy! 🛞'],
  guard: ['💂', 'tumhara *GUARD* hy! 🛡️'],
  alien: ['👽', 'tumhara *ALIEN* hy! 🛸'],
  superhero: ['🦸', 'tumhara *SUPERHERO* hy! 💥'],
  villain: ['🦹', 'tumhara *VILLAIN* hy! 😈'],
  prince: ['🤴', 'tumhara *PRINCE* hy! 👑'],
  princess: ['👸', 'tumhari *PRINCESS* hy! 🎀'],
  baba: ['🧔', 'tumhara *BABA* hy! 🙏'],
  maa: ['👩', 'tumhari *MAA* hy! ❤️'],
  bhaiya: ['🧑', 'tumhara *BHAIYA* hy! 💪'],
  didi: ['👩', 'tumhari *DIDI* hy! 🌸'],
  pota: ['👦', 'tumhara *POTA* hy! 😄'],
  poti: ['👧', 'tumhari *POTI* hy! 🎀'],
  naukar: ['🧹', 'tumhara *NAUKAR* hy! 😅'],
  mureed: ['🤲', 'tumhara *MUREED* hy! 🕋'],
  murshid: ['🧙', 'tumhara *MURSHID* hy! 🔮'],
  shagird: ['🎓', 'tumhara *SHAGIRD* hy! 📖'],
};

// rating-style commands -> [emoji, label]
const RATINGS = {
  chad: ['🗿', 'CHAD level'],
  npc: ['🤖', 'NPC energy'],
  maincharacter: ['🌟', 'Main Character energy'],
  delulu: ['🫠', 'DELULU level'],
  redflag: ['🚩', 'RED FLAG count'],
  greenflag: ['💚', 'GREEN FLAG count'],
  simp: ['🥺', 'SIMP level'],
  vibe: ['🎶', 'VIBE level'],
  muth: ['🤣', 'MUTH level'],
  cake: ['🎂', 'CAKE level'],
  pickup: ['😏', 'PICKUP line skill'],
  tecnologia: ['💻', 'TECH knowledge'],
  taroun: ['🔮', 'TAROT luck'],
  horoscope: ['♈', 'Horoscope luck'],
  swag: ['😼', 'SWAG level'],
  gareeb: ['🪙', 'GAREEBI level'],
  ameer: ['💰', 'AMEERI level'],
  handsome: ['😍', 'HANDSOME score'],
  cute: ['🥰', 'CUTENESS score'],
  dumb: ['🥴', 'DUMBNESS level'],
  lucky: ['🍀', 'LUCK level'],
  unlucky: ['☔', 'BAD-LUCK level'],
  loyal: ['🤝', 'LOYALTY level'],
  flirty: ['😉', 'FLIRT level'],
  funny: ['😂', 'COMEDY level'],
  boring: ['😴', 'BORING level'],
  attitude: ['😤', 'ATTITUDE level'],
  dil: ['❤️', 'DIL ka size'],
  dimagh: ['🧠', 'DIMAGH level'],
  shakal: ['🪞', 'SHAKAL score'],
  style: ['🕶️', 'STYLE score'],
  game: ['🎮', 'GAME level'],
  naach: ['💃', 'DANCE skill'],
  gana: ['🎤', 'SINGING skill'],
  comedy: ['🎭', 'COMEDY skill'],
  fight: ['🥊', 'FIGHT skill'],
  bhag: ['🏃', 'RUNNING speed'],
  neend: ['😴', 'SLEEP score'],
  bhukh: ['🍔', 'HUNGER level'],
  pyar: ['💞', 'PYAR level'],
  nafrat: ['💔', 'NAFRAT level'],
  iman: ['🕋', 'IMAN level'],
  gunah: ['😈', 'GUNAH count'],
  sawab: ['✨', 'SAWAB count'],
  qismat: ['🎰', 'QISMAT score'],
  body: ['💪', 'BODY level'],
  height: ['📏', 'HEIGHT score'],
  iq: ['🧠', 'IQ level'],
  eq: ['💗', 'EQ level'],
  bank: ['🏦', 'BANK balance'],
  followers: ['👥', 'FOLLOWERS count'],
  rizz2: ['🔥', 'ULTRA RIZZ'],
};

// dedicated fool lines (the TARGET is the fool)
const FOOL_LINES = [
  '🤡 @x *PAGAL* nikla! 😂',
  '🤡 @x ka dimagh *ghas* kha gaya! 🌿',
  '🤡 @x duniya ka *No.1 PAGAL* hy! 🏆',
  '🤡 @x ne aaina dekha aur aaina *toot* gaya! 🪞💥',
  '🤡 @x ki akal *chhutti* pe gayi hy! 🏖️',
  '🤡 @x ko *PAGAL* declare kiya gaya! 📢',
  '🤡 @x ka sarr *khali* hy, sirf hawa! 💨',
  '🤡 @x *PAGALON* ka leader hy! 👑🤪',
  '🤡 @x se zyada *bewaqoof* koi nahi! 🙃',
  '🤡 @x ka IQ *minus* me hy! 📉',
  '🤡 @x *mental* hospital ka VIP member hy! 🏥',
  '🤡 @x ko *pagal* khana khilaya gaya! 🍽️🤪',
  '🤡 @x ka dimagh *Windows 95* chalata hy! 🖥️',
  '🤡 @x *PAGAL* hy, aur is pe fakhr karta hy! 😎🤡',
  '🤡 @x ki *akal* ne resign de diya! 📄',
  '🤡 @x ko dekh ke *pagal* bhi hasse! 😂',
];

async function nekoImg(cat) {
  const r = await getJSON(`https://nekos.best/api/v2/${cat}`);
  return r?.results?.[0]?.url || null;
}

/** FNV-1a hash → stable number (so the same person always gets the same score). */
function hashNum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic score 1–100 for (target, command). */
function scoreFor(num, cmd) {
  return (hashNum(`${cmd}:${num}`) % 100) + 1;
}

const handler = async (ctx) => {
  const { command, reply } = ctx;

  // Resolve the target: replied-to person → @mention → phone-number arg.
  const target = targetOf(ctx);
  // `target.tag` is name-safe: an unresolved LID prints the display name
  // instead of digits that WhatsApp would render against the wrong contact.
  const tag = target ? target.tag : null;
  const mentions = target ? [target.jid] : [];

  // ---- .fool — the TARGET is the fool (never the sender) ----
  if (command === 'fool' || command === 'pagal' || command === 'bewaqoof') {
    if (!target) {
      return reply('🤡 Kisko *PAGAL* banana hy? Us ke message pe *reply* karo ya *@tag* karo.');
    }
    const line = pick(FOOL_LINES).replace('@x', tag);
    return ctx.send(ctx.from, { text: line, mentions }, { quoted: ctx.m });
  }

  // ---- role commands ----
  if (ROLES[command]) {
    if (!target) {
      return reply(`🤔 Kisko? Us ke message pe *reply* karo ya *@tag* karo, phir \`${config.PREFIX}${command}\` bhejo.`);
    }
    const [emoji, line] = ROLES[command];
    return ctx.send(ctx.from, { text: `${emoji} ${tag} ${line}`, mentions }, { quoted: ctx.m });
  }

  // ---- rating commands (deterministic per person) ----
  if (RATINGS[command]) {
    const [emoji, label] = RATINGS[command];
    const who = target ? target.num : ctx.senderNum;
    const whoTag = target ? tag : `@${contacts.displayNum(ctx.senderNum)}`;
    const whoMentions = target ? mentions : [`${contacts.resolve(ctx.sender)}`];
    const pct = scoreFor(who, command);
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    return ctx.send(ctx.from, {
      text: `${emoji} *${label}* for ${whoTag}\n${bar} *${pct}%*`,
      mentions: whoMentions,
    }, { quoted: ctx.m });
  }

  // ---- DP commands (boydp1..22 / girldp1..22) ----
  if (/^(boy|girl)dp\d+$/.test(command)) {
    const isGirl = command.startsWith('girl');
    try {
      const url = await nekoImg(isGirl ? 'waifu' : 'husbando');
      if (!url) throw new Error('no img');
      await ctx.send(ctx.from, { image: { url }, caption: `${isGirl ? '👧' : '👦'} *${command}* DP\n👑 ${config.BOT_NAME}` }, { quoted: ctx.m });
    } catch { await reply('❌ DP nahi mili, dobara try karo.'); }
    return;
  }

  await reply('❓ Unknown character command');
};

const commands = [
  ...Object.keys(ROLES), ...Object.keys(RATINGS),
  'fool', 'pagal', 'bewaqoof',
  ...Array.from({ length: 22 }, (_, i) => `boydp${i + 1}`),
  ...Array.from({ length: 22 }, (_, i) => `girldp${i + 1}`),
];

module.exports = { commands, category: '🎎 CHARACTERS', handler };
