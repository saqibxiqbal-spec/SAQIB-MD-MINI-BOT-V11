/**
 * FUN — text-based fun commands (offline, always work)
 * (reaction commands live in reactions.js; roles in characters.js)
 */
const config = require('../config');
const { pick, randInt, targetOf } = require('../lib/helpers');
const interactions = require('../lib/interactions');

// ---------------------------------------------------------------------------
// ROASTS — 90+ lines
// ---------------------------------------------------------------------------
const ROASTS = [
  'Tumhari tarah main bhi soch raha tha ke zindagi me kuch karna hy... phir maine sochna chhor diya. 😂',
  'Wifi ka signal bhi tumse zyada strong hy. 📶',
  'Tumhari profile photo dekh ke meri camera ne resign de diya. 📸',
  'Tum utne slow ho ke snail bhi keh de "bhai race mat jeeto ge". 🐌',
  'Brain chahiye tha tumhe, tumne WiFi router le liya. 🧠',
  'Tumhari shakal dekh ke mirror bhi chashma pehen leta hy. 🪞',
  'Google bhi tumhara naam search kare to "did you mean: galti"? 🔍',
  'Tum ho itne boring ke tumhara shadow bhi tumse door bhagta hy. 🌑',
  'Tumhari personality ka password "1234" hy — koi bhi guess kar le. 🔓',
  'Tumse baat karke lagta hy silence bhi ek gift hy. 🤐',
  'Tumhari jokes par sirf tum hi hanste ho — aur wo bhi majboori me. 😅',
  'Tum ho itne late ke tumhare "kal" ko bhi calendar chahiye. 📅',
  'Tumhara dimagh airplane mode me hy — hamesha. ✈️',
  'Tumse milke lagta hy "Ctrl+Z" zindagi me hota to acha tha. ⌨️',
  'Tumhari soch ka data plan khatam ho gaya lagta hy. 📵',
  'Tum ho itne kamzor ke tumhara WiFi bhi tumhe nahi pehchanta. 📡',
  'Tumhari smile dekh ke bulb bhi keh de "main off ho jata hoon". 💡',
  'Tumse zyada toh tumhara phone charger interesting hy. 🔌',
  'Tumhari baatein sun ke autotune bhi bezaar ho jaye. 🎤',
  'Tum ho itne unlucky ke black cat tumse raasta maangti hy. 🐈‍⬛',
  'Tumhara talent "online hone" tak mehdood hy. 🟢',
  'Tumhari typing speed dekh ke keyboard ne suicide note likha. ⌨️',
  'Tumse poocha to tumne "pata nahi" ko career bana liya. 🤷',
  'Tumhari energy dekh ke sloth bhi keh de "bhai relax". 🦥',
  'Tum ho itne simple ke tumhara bio bhi blank hy. 📄',
  'Tumhari selfie dekh ke front camera ne camera-shy ho gaya. 🤳',
  'Tumse zyada excitement toh tumhari notification sound me hy. 🔔',
  'Tumhara humor "404 not found". 🚫',
  'Tum ho itne late ke tumhare birthday bhi late aata hy. 🎂',
  'Tumhari knowledge dekh ke Wikipedia ne "citation needed" lagaya. 📚',
  'Tumse baat karke ChatGPT bhi kehta hy "main retire ho raha hoon". 🤖',
  'Tumhari speed dekh ke internet ne dial-up yaad dila diya. ☎️',
  'Tum ho itne confusing ke GPS bhi tumhe dhoondhte hue kho jaye. 🗺️',
  'Tumhara confidence aur tumhara talent — dono opposite direction me chalte hain. 🧭',
  'Tumse milke lagta hy "mute" button zindagi ka best invention hy. 🔇',
  'Tumhari planning dekh ke kal bhi has raha hy. 🗓️',
  'Tum ho itne slow ke tumhara buffering bhi tumse aage nikal gaya. ⏳',
  'Tumhara style "2010" me atka hua hy. 🕰️',
  'Tumse zyada deep toh tumhara WhatsApp "typing..." indicator hy. 💬',
  'Tumhari arguments ka base "kyunke maine bola" hy. 🧱',
  'Tum ho itne predictable ke tumhara horoscope bhi bore ho jaye. ♈',
  'Tumhara game dekh ke controller ne resign de diya. 🎮',
  'Tumse baat karke lagta hy "block" button ne bhi tumhe block kar diya. ⛔',
  'Tumhari memory dekh ke goldfish bhi keh de "bhai tum bhool gaye". 🐠',
  'Tum ho itne lazy ke tumhara shadow bhi tumhare liye kaam karta hy. 😴',
  'Tumhara IQ aur tumhara shoe size — guess karo kaunsa bara hy. 👟',
  'Tumse zyada interesting toh tumhari "last seen" hy. 👀',
  'Tumhari jokes par laugh track bhi force lagta hy. 🎬',
  'Tum ho itne average ke tumhara naam bhi "Average" hy. 📊',
  'Tumhara future dekh ke crystal ball bhi toot gayi. 🔮',
  'Tumse milke lagta hy "error 404: personality not found". 🧩',
  'Tumhari speed dekh ke tortoise ne record tod diya. 🐢',
  'Tumhara swag "swag" nahi, "swag-off" hy. 🔕',
  'Tum ho itne boring ke tumhara echo bhi sun ke so jaye. 💤',
  'Tumhari logic dekh ke Einstein ne maths chhor di. ➗',
  'Tumse zyada charisma toh tumhara ringtone hy. 📞',
  'Tumhara dimagh "low battery" mode me hy — hamesha. 🔋',
  'Tumhari baatein sun ke DJ ne music band kar diya. 🎧',
  'Tum ho itne slow ke tumhara "abhi aata hoon" ka matlab "agli zindagi" hy. 🚶',
  'Tumhara attitude aur tumhara result — dono mismatch hain. 📉',
  'Tumse baat karke lagta hy "airplane mode" best feature hy. ✈️',
  'Tumhari selfie ka best filter "off" hy. 🚫',
  'Tum ho itne unlucky ke tumhara lucky number bhi 13 hy. 🍀',
  'Tumhara humour "dad joke" se bhi neeche hy. 👨',
  'Tumse zyada toh tumhara phone ka wallpaper interesting hy. 🖼️',
  'Tumhari planning dekh ke "spontaneous" bhi confuse ho gaya. 🤔',
  'Tum ho itne simple ke tumhara password "password" hy. 🔑',
  'Tumhara game face dekh ke poker table bhi khaali ho gaya. 🃏',
  'Tumse baat karke lagta hy "do not disturb" hamesha on hona chahiye. 🔕',
  'Tumhari speed dekh ke 2G bhi keh de "bhai tum slow ho". 📶',
  'Tumhara style dekh ke fashion police ne case darj kar diya. 👮',
  'Tum ho itne late ke tumhara alarm bhi tumse pehle uth jaye. ⏰',
  'Tumhari knowledge dekh ke Google ne "I give up" likha. 🔍',
  'Tumse zyada deep toh tumhara "seen" wala message hy. 👁️',
  'Tumhara confidence dekh ke mirror bhi sharma jaye. 🪞',
  'Tum ho itne boring ke tumhara WiFi bhi tumse disconnect ho jaye. 🔌',
  'Tumhari jokes par sirf cricket commentary energetic hoti hy. 🏏',
  'Tumhara talent "excuse banane" me world-class hy. 🏆',
  'Tumse milke lagta hy "unfriend" button ne tumhe bana diya. 👋',
  'Tumhari speed dekh ke bullet train ne brake maara. 🚄',
  'Tum ho itne confusing ke tumhara GPS bhi "recalculating" me atka hy. 🧭',
  'Tumhara mood swings dekh ke weather forecast resign kar de. 🌦️',
  'Tumse zyada interesting toh tumhara "typing..." ka dot-dot hy. ⌨️',
  'Tumhari memory dekh ke elephant bhi keh de "bhai tum kaun ho?". 🐘',
  'Tum ho itne average ke tumhara report card bhi "meh" kehta hy. 📋',
  'Tumhara swag dekh ke "swag" ne bhi naam badal liya. ✨',
  'Tumse baat karke lagta hy "silent mode" ek blessing hy. 🤫',
  'Tumhari selfie dekh ke photographer ne camera bech diya. 📷',
  'Tum ho itne slow ke tumhara "coming" ka matlab "never". 🚗',
  'Tumhara logic dekh ke calculator ne error de diya. 🧮',
  'Tumse zyada charisma toh tumhara "away" status hy. 💤',
  'Tumhari baatein sun ke echo bhi "repeat" karne se inkaar kar de. 🔁',
  'Tum ho itne boring ke tumhara shadow bhi alag group bana le. 👥',
  'Tumhara future bright nahi, "low battery" hy. 🔆',
  'Tumse milke lagta hy "mute all" life ka motto hona chahiye. 🔇',
];

// ---------------------------------------------------------------------------
// Other fun banks
// ---------------------------------------------------------------------------
const COMPLIMENTS = [
  'Tum wo ho jiske aane se group ki vibe theek ho jati hy ✨',
  'Smile to dekho, sasta sunblock lag jata hy ☀️',
  'Tumhari tarif me itni lambi list hy ke WhatsApp character limit maan gayi 💯',
  'Tumhari energy dekh ke Monday bhi weekend ban jaye 🌈',
  'Tum ho toh group me noor hy 🌟',
];
const QUOTES = [
  'Kaam aisa karo ke naam khud likha jaye. — Anonymous',
  'Mushkilein sirf unhe milti hain jo kuch karna chahte hain. 🌱',
  'Sabr phal meetha hota hy, bas waqt lambe rehte hain. ⏳',
  'Khud par bharosa wo capital hy jo kabhi depreciation nahi hota. 💪',
  'Jo aaj chhota lagta hy, kal wo tumhari strength banta hy. 🚀',
];
const SHAYARI = [
  'Chand ko dekh kar yeh mat samajh,\nke raat khatam ho gayi hy,\nab to bas tumhara message aana baqi hy. 🌙',
  'Tere naam se shuru hota hy mera din,\naur tere "seen" hone par mukammal. 💬',
  'Zindagi ki bhag-daur me ek lamha ruk jao,\njine ke liye kuch pal khud ke liye nikalo. 🌸',
  'Dil kehta hy likh doon tumhe,\npar ungliyan keyboard par ruk jati hain. ✍️',
];
const JOKES = [
  'Doctor: Tension nahi lena chahiye. Patient: Main to doctor se share kar raha hoon, aap lena chhoro. 😂',
  'Teacher: Kal test hy. Student: Kal se parhta hoon. Aaj mood nahi. 😅',
  'WiFi ke samne baithe ho to tum bhi 5G speed se bhagte ho... khane tak. 🍽️',
  'Biwi: Mujhe tumhari aadat pasand nahi. Shohar: Achi baat hy, mujhe bhi apni nahi. 😆',
  'Interviewer: Aapki strength? Candidate: Main jaldi gussa nahi karta. Interviewer: Achha? Candidate: Haan, ab poochho warna... 😤',
  'Pappu: Mujhe neend nahi aati. Doctor: Count karo. Pappu: Maine 1, 2, 3... aur phir main so gaya. 😴',
  'Teacher: 2 aur 2 kitne? Student: 4. Teacher: Shabash. Student: Aur 2 aur 2? Teacher: Woh bhi 4. Student: Wah, kya coincidence! 🤯',
  'Mera bank account aur mera patience — dono same time par khatam hote hain. 💸',
  'Mummy: Padhai karo. Main: Kar raha hoon. Mummy: Kya? Main: Reels dekh ke inspiration. 📱',
  'Friend: Gym join kiya? Main: Haan. Friend: Result? Main: Ab main aaram se thakta hoon. 🏋️',
  'Boss: Tum late kyun aaye? Main: Traffic. Boss: Kal? Main: Traffic ka season chal raha hy. 🚗',
  'Mera alarm aur mera determination — dono 5 min me off ho jate hain. ⏰',
  'Doctor: Exercise karo. Main: Roz karta hoon. Doctor: Kya? Main: Fridge kholna-band karna. 🧊',
  'Teacher: Essay likho "Meri Gaaye". Student ne likha: Meri gaaye... aur main so gaya. 🐄',
  'Auntie: Shaadi kab karoge? Main: Jab bank balance bole "haan". 💍',
  'Meri diet plan: Subah healthy, dopahar healthy, raat... jo mile wo. 🍕',
  'Friend: Tumhara crush kaun? Main: WiFi. Friend: Kyun? Main: Kyunke connection sabse strong hy. 📶',
  'Papa: Bijli ka bill kam karo. Main: AC band kar doon? Papa: Nahi, tumhara phone charger nikaal do. 🔌',
  'Mera favorite exercise hy "jumping to conclusions". 🤸',
  'Teacher: Homework kahan hy? Main: Ghar par. Teacher: To lao. Main: Ghar par hi hy na. 🏠',
  'Meri savings ka secret: pehle kharach, phir... bas kharach. 🛒',
  'Doctor: Aapko aaram chahiye. Main: Main to 24 ghante aaram karta hoon. Doctor: Woh problem hy. 🛌',
  'Mera phone 1% par 30 min chalta hy, par mera motivation 100% par 30 sec. 🔋',
  'Friend: Naya saal, naya main. Main: Haan, same purana main, naya calendar. 📅',
  'Meri personality aur mera WiFi — dono "connected" dikhte hain par kaam nahi karte. 📡',
  'Teacher: Itna late kyun? Main: Sir, main time se aaya tha, baaki sab late aaye. 😎',
  'Meri life ka motto: Kal se shuru. Aur kal bhi kal se shuru. 🔁',
  'Auntie: Beta khaana khao. Main: Diet par hoon. Auntie: Ek piece se kya hoga? Main: Wahi soch ne mujhe yahan tak pahunchaya. 🍰',
  'Mera bank SMS: "Balance low". Mera reaction: "Pata hy, aur?" 📩',
  'Friend: Padhai kar rahe ho? Main: Haan. Friend: Book kahan hy? Main: Motivation me. 📚',
];
const FACTS = [
  'Octopus ke 3 dil hote hain 🐙',
  'Shehad (honey) kabhi kharab nahi hota 🍯',
  'Eiffel Tower sirf 6 mahine ke liye banai gayi thi 🏛️',
  'Dolphin ek aankh khol kar soti hy 🐬',
  'Pakistan me world ki sab se gehri choti K2 hy 🏔️',
  'Bees (madhumakhiyan) apni zindagi me sirf 1 chammach shehad banati hain 🐝',
  'Insaan ka dil din me ~100,000 dafa dhadakta hy ❤️',
  'Chand par pehla qadam 1969 me Neil Armstrong ne rakha 🌕',
  'Bijli ki roshni bijli se ~1 million guna tez hoti hy ⚡',
  'Antarctica duniya ka sab se bara desert hy 🏜️',
  'Aankh (eye) 10 million colors detect kar sakti hy 👁️',
  'Banana technically ek berry hy 🍌',
];
const G8 = ['Hy ✅', 'Nahi ❌', 'Kabhi nahi 🚫', 'Zaroor 💯', 'Poochhte hi raho 😒', 'Ho sakta hy 🤔', 'Mera jawab hy: HAAN! 🔥', 'Bilkul nahi 😏', 'Sitaron me likha hy... shayad 🌟'];
const DARES = [
  'Apni last photo group me bhejo 😈',
  '5 min ke liye apna WhatsApp status "Main pagal hoon" lagao 😂',
  'Kisi ajnabi ko "Salam bhai" likho aur screenshot do 😆',
  'Apni voice note bhejo gaana gaake 🎤',
  'Apne crush ko "hi" likho aur result batao 😳',
];
const TRUTHS = [
  'Sab se embarrassing message kisko bheja? 👀',
  'Aakhri dafa roya kab tha? 😅',
  'Aik raaz batao jo ab tak kisi ko nahi pata? 🤫',
  'Sab se bari galti kya ki zindagi me? 😬',
  'Kis se sab se zyada jealous hota ho? 😏',
];
const RIZZ = [
  'Kya aap WiFi ho? Kyunke connection acha lagta hy 📶',
  'Google par maine search kiya tha, aap hi mil gaye 🌐',
  'Aapki smile ka screenshot mere gallery ka best photo hy 📸',
  'Kya aap magnet ho? Kyunke mujhe aapki taraf khinchav hy 🧲',
  'Aapki aankhon me doobne ka plan hy, swimming seekh loon pehle? 🏊',
];
const MEMES = ['https://i.imgflip.com/30b1gx.jpg', 'https://i.imgflip.com/1bij.jpg', 'https://i.imgflip.com/26am.jpg', 'https://i.imgflip.com/1ur9b0.jpg'];
const EMOJIS = ['😀', '😂', '🥰', '😎', '🔥', '💯', '🎉', '🤩', '😇', '🤔', '😴', '🥳', '😭', '😱', '🤯'];

// Would You Rather bank (interactive)
const WYR = [
  { q: 'Ameer ho kar akela raho', a: 'Paisa 💰', b: 'Rishtay ❤️' },
  { q: 'Hamesha sach bolo', a: 'Sach 🗣️', b: 'Chup rehna 🤐' },
  { q: 'Udne ki taqat', a: 'Uddna 🕊️', b: 'Invisible hona 👻' },
  { q: 'Har cheez bhool jao', a: 'Bhoolna 🧠', b: 'Yaad rehna 📌' },
  { q: 'Sirf phone ya sirf khaana', a: 'Phone 📱', b: 'Khaana 🍔' },
  { q: 'Amir ho kar bore', a: 'Amir 💸', b: 'Gareeb khush 😊' },
  { q: 'Time travel past', a: 'Past ⏪', b: 'Future ⏩' },
  { q: 'Hamesha late', a: 'Late 🐢', b: 'Hamesha pehle 🐇' },
  { q: 'Dost ya paisa', a: 'Dost 🤝', b: 'Paisa 💰' },
  { q: 'Samundar ya pahaad', a: 'Samundar 🌊', b: 'Pahaad 🏔️' },
  { q: 'Famous ho kar akela', a: 'Famous 🌟', b: 'Normal khush 😌' },
  { q: 'Har din Monday', a: 'Monday 😩', b: 'Har din Friday 🎉' },
];

// ---------------------------------------------------------------------------
// Deterministic aura (same user -> same score, so it feels "real")
// ---------------------------------------------------------------------------
function hashNum(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
function auraFor(num) {
  const h = hashNum(num || 'guest');
  const score = 1000 + (h % 9000); // 1000 - 9999
  const tiers = [
    { min: 9000, title: 'MYTHIC 👑', note: 'Tum toh legend ho bhai! 🔥' },
    { min: 7500, title: 'SIGMA 🗿', note: 'Aura maxed out! 💪' },
    { min: 6000, title: 'ALPHA 🦁', note: 'Solid aura, respect! ✨' },
    { min: 4500, title: 'BETA 🐺', note: 'Acha hy, aur kamana hy to kaam karo 😎' },
    { min: 3000, title: 'GAMMA 🐣', note: 'Thoda grind chahiye 📈' },
    { min: 0, title: 'NPC 🤖', note: 'Aura recharge karo 😅' },
  ];
  const tier = tiers.find((t) => score >= t.min);
  const bars = Math.max(1, Math.min(10, Math.round(score / 1000)));
  const bar = '█'.repeat(bars) + '░'.repeat(10 - bars);
  return { score, tier, bar };
}

const handler = async (ctx) => {
const contacts = require('../lib/contacts');
  const { command, reply, arg } = ctx;
  // Real target: replied-to user → @mention → number arg → else sender.
  // `targetOf` resolves LIDs to real numbers and returns the correct JID domain,
  // so mentions never render a fake number like +212223345675336.
  const target = targetOf(ctx);
  const tagNum = target ? target.num : ctx.senderNum;
  // Print-safe tag: unresolved LIDs show the person's name, never fake digits.
  const tag = target ? target.tag : `@${contacts.displayNum(ctx.senderNum)}`;
  const tagJid = target ? target.jid : contacts.resolve(ctx.sender);
  const mention = (txt) => ctx.send(ctx.from, { text: txt, mentions: [tagJid] }, { quoted: ctx.m });

  switch (command) {
    case 'roast': return mention(`${tag} 🔥 ${pick(ROASTS)}`);
    case 'compliment': return mention(`${tag} ${pick(COMPLIMENTS)}`);
    case 'quote': return reply(`💬 *Quote:*\n\n${pick(QUOTES)}`);
    case 'shayari': return reply(`🌹 *Shayari:*\n\n${pick(SHAYARI)}`);
    case 'joke': case 'bacha': return reply(`😂 ${pick(JOKES)}`);
    case 'fact': return reply(`🧠 *Fact:* ${pick(FACTS)}`);
    case 'emoji': return reply(`🎲 ${pick(EMOJIS)}`);
    case 'meme': return ctx.send(ctx.from, { image: { url: pick(MEMES) }, caption: `😂 *${config.BOT_NAME} Meme*` }, { quoted: ctx.m });
    case '8ball': return arg ? reply(`🎱 *${arg}*\n\n${pick(G8)}`) : reply('❌ Sawal likho: .8ball kya main pass ho jaon ga?');
    case 'lovetest': case 'ship': {
      const [a, b] = arg.split(/,|&|vs|and/i).map((x) => x && x.trim()).filter(Boolean);
      if (!a || !b) return reply(`❌ Do naam do. Example: ${config.PREFIX}${command} Ali, Sana`);
      const pct = randInt(50, 100);
      const hearts = '❤️'.repeat(Math.ceil(pct / 20));
      return reply(`💕 *${a} 💘 ${b}*\n\n${hearts} *${pct}%*\n${pct > 80 ? 'Shaadi ka laddu tod lo! 🎉' : 'Achi jori hy, mashallah 😄'}`);
    }
    case 'shipname': {
      const [a, b] = arg.split(/,|&|vs|and/i).map((x) => x && x.trim()).filter(Boolean);
      if (!a || !b) return reply(`❌ Do naam do. Example: ${config.PREFIX}shipname Ali, Sana`);
      const name = (a.slice(0, Math.ceil(a.length / 2)) + b.slice(Math.floor(b.length / 2))).replace(/\s/g, '');
      return reply(`💞 *Ship Name:* ${name.charAt(0).toUpperCase() + name.slice(1)} 💘`);
    }
    case 'compatibility': {
      const [a, b] = arg.split(/,|&|vs|and/i).map((x) => x && x.trim()).filter(Boolean);
      if (!a || !b) return reply(`❌ Do naam do. Example: ${config.PREFIX}compatibility Ali, Sana`);
      const pct = randInt(30, 100);
      return reply(`🧩 *Compatibility: ${a} + ${b}*\n\n*${pct}%*\n${pct > 75 ? 'Perfect match! 💯' : 'Thodi mehnat chahiye 😅'}`);
    }
    case 'aura': {
      const { score, tier, bar } = auraFor(tagNum);
      return mention(`${tag} ⚡ *AURA: ${score}*\n${bar}\n🏅 Rank: *${tier.title}*\n${tier.note}`);
    }
    case 'rate': case 'character': {
      const pct = (hashNum('rate' + tagNum) % 41) + 60; // 60-100, deterministic
      return mention(`${tag} ⭐ *Rate: ${pct}/100*\n${pct > 85 ? 'Top class! 🏆' : pct > 70 ? 'Solid banda hy 💯' : 'Aur mehnat karo 😎'}`);
    }
    case 'truth': return reply(`🕵️ *TRUTH:* ${pick(TRUTHS)}`);
    case 'dare': return reply(`😈 *DARE:* ${pick(DARES)}`);
    case 'wyr': {
      const w = pick(WYR);
      interactions.set(ctx.from, ctx.sender, 'choice', {
        options: [
          { result: () => `✅ Tumne chuna: *${w.a}*\n_${w.q} — interesting choice! 😏_` },
          { result: () => `✅ Tumne chuna: *${w.b}*\n_${w.q} — nice pick! 😎_` },
        ],
      });
      return reply(`🤔 *Would You Rather:*\n\n1️⃣ ${w.a}\n2️⃣ ${w.b}\n\n_Reply *1* ya *2* karo!_`);
    }
    case 'rizz': return reply(`😏 *Rizz line:*\n\n"${pick(RIZZ)}"`);
    case 'sigma': {
      const { score, tier } = auraFor('sigma' + tagNum);
      return mention(`🗿 *SIGMA CHECK*\n\nSigma level: ${score}/10000\nRank: ${tier.title}\nRespect +${score % 100} 🗿`);
    }
    case 'dice': return reply(`🎲 Dice: *${randInt(1, 6)}*`);
    case 'coin': case 'coinflip': case 'flip': return reply(`🪙 ${pick(['HEADS', 'TAILS'])}!`);
    case 'slot': {
      const s = ['🍒', '🍋', '🍇', '💎', '7️⃣', '🔔'];
      const r = [pick(s), pick(s), pick(s)];
      const win = r[0] === r[1] && r[1] === r[2];
      return reply(`🎰 *SLOT MACHINE*\n\n[ ${r.join(' | ')} ]\n\n${win ? '🎉 JACKPOT! Tum jeet gaye!' : '😢 Try again!'}`);
    }
    case 'font': {
      if (!arg) return reply(`❌ Text do. Example: ${config.PREFIX}font SAQIB`);
      const map = { a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ' };
      return reply(arg.toLowerCase().split('').map((c) => map[c] || c).join(''));
    }
    case 'repeat': return reply(arg || '❌ Text do.');
    case 'heart': return reply('💖💖💖 *Hearts for you!* 💖💖💖');
    default: return reply('❓ Unknown fun command');
  }
};

module.exports = {
  commands: [
    'roast', 'compliment', 'quote', 'shayari', 'joke', 'bacha', 'fact', 'emoji', 'meme', '8ball',
    'lovetest', 'ship', 'shipname', 'compatibility', 'aura', 'rate', 'character', 'truth', 'dare',
    'wyr', 'rizz', 'sigma', 'dice', 'coin', 'coinflip', 'flip', 'slot', 'font', 'repeat', 'heart',
  ],
  category: '😂 FUN',
  handler,
};
