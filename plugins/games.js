/**
 * GAMES — mini games & group fun (state kept in memory per chat)
 */
const config = require('../config');
const { pick, randInt } = require('../lib/helpers');

const P = () => config.PREFIX;

/* ---------------- shared state ---------------- */
const scores = new Map();   // user -> points
const wallets = new Map();  // user -> coins
const games = new Map();    // chatId -> active game
const pets = new Map();     // user -> pet
const farms = new Map();    // user -> {planted, stage}

const points = (u) => scores.get(u) || 0;
const addPoints = (u, n) => { scores.set(u, points(u) + n); return scores.get(u); };
const coins = (u) => wallets.get(u) || 0;
const addCoins = (u, n) => { wallets.set(u, Math.max(0, coins(u) + n)); return wallets.get(u); };

const QUIZ = [
  ['Pakistan ka qaumi phool?', ['Chambeli', 'Gulab', 'Surajmukhi', 'Kamal'], 0],
  ['Sab se bara sayyara?', ['Mangal', 'Mushteri', 'Zuhal', 'Zameen'], 1],
  ['Pani ka chemical formula?', ['CO2', 'H2O', 'O2', 'NaCl'], 1],
  ['Quran me kitni surah hain?', ['100', '110', '114', '120'], 2],
  ['Sab se tez janwar?', ['Sher', 'Cheetah', 'Ghora', 'Hiran'], 1],
  ['Pakistan kis saal azaad hua?', ['1945', '1946', '1947', '1948'], 2],
  ['Duniya ka sab se bara samundar?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 3],
  ['Insaan ke kitne daant hote hain (adult)?', ['28', '30', '32', '34'], 2],
];
const TRUTH = ['Sab se zyada kis se dar lagta hai?', 'Aakhri jhoot kab bola tha?', 'Sab se buri aadat kya hai?', 'Kisi ko secretly pasand karte ho?', 'Phone me sab se embarrassing photo kya hai?'];
const DARE = ['Apni sab se buri selfie bhejo', 'Voice note me gaana gao', 'Kisi ko 3 compliments do', 'Apna search history ka pehla lafz batao', '10 second tak cheekhein maaro'];
const NHIE = ['Never have I ever... jhoot bola ho.', 'Never have I ever... class me soya ho.', 'Never have I ever... kisi ka message ignore kiya ho.', 'Never have I ever... exam me cheating ki ho.', 'Never have I ever... raat 3 baje tak phone chalaya ho.'];
const PARANOIA = ['Agar tumhe 24 ghante ke liye invisible hone ka mauqa mile to kya karte?', 'Tumhare bare me kya afwah phelayi gayi?', 'Kis cheez ke liye tum jhoot bolte ho?'];
const CAPITALS = [['Pakistan', 'Islamabad'], ['India', 'New Delhi'], ['China', 'Beijing'], ['Turkey', 'Ankara'], ['Japan', 'Tokyo'], ['Egypt', 'Cairo'], ['Iran', 'Tehran'], ['Saudi Arabia', 'Riyadh']];
const FLAGS = [['🇵🇰', 'Pakistan'], ['🇮🇳', 'India'], ['🇹🇷', 'Turkey'], ['🇯🇵', 'Japan'], ['🇨🇳', 'China'], ['🇸🇦', 'Saudi Arabia'], ['🇬🇧', 'United Kingdom'], ['🇺🇸', 'United States']];
const EMOJI_STORY = [['🚗💨😱🏥', 'Car accident'], ['👦❤️👧💍', 'Love marriage'], ['🎓📚💪🏆', 'Study success'], ['🍕😋🤤', 'Pizza craving']];
const SONGS = ['Tum Hi Ho', 'Kesariya', 'Pasoori', 'Afreen Afreen', 'Dil Dil Pakistan', 'Jee Le Zara'];

const handler = async (ctx) => {
  const { command, reply, arg, senderNum, from, isGroup, pushname } = ctx;
  const who = senderNum || pushname || 'player';
  const chat = from || 'chat';

  switch (command) {
    /* ---------------- simple fun ---------------- */
    case 'paranoia': return reply(`😳 *Paranoia*\n\n${pick(PARANOIA)}`);
    case 'nhie': return reply(`🙊 *Never Have I Ever*\n\n${pick(NHIE)}`);
    case 'couple': return reply(`💑 *Couple of the day*\n\n${isGroup ? 'Aaj ka couple: *' + pick(['Ali ❤️ Ayesha', 'Hamza ❤️ Zara', 'Saqib ❤️ Hina', 'Usman ❤️ Maryam']) + '*' : 'Ye command group me maza deti hai 😄'}`);
    case 'spinthebottle': return reply(`🍾 *Bottle ghoomi...*\n\n👉 ${isGroup ? 'Kisi member par ruk gayi! Random pick: *' + (ctx.mentioned?.[0]?.split('@')[0] || 'aap') + '*' : 'Group me try karo'}`);
    case 'songguess': {
      if (!isGroup) return reply('❌ Ye group game hai.');
      const s = pick(SONGS);
      games.set(chat, { type: 'song', answer: s.toLowerCase(), tries: 0 });
      return reply(`🎵 *Song Guess*\n\nFilm/song ka naam guess karo — 1 minute me jawab do!\n\n_Hint: pehla lafz "${s.split(' ')[0]}"_\n\nJawab likh kar bhejo.`);
    }
    case 'emojistory': return reply(`📱 *Emoji Story*\n\n${pick(EMOJI_STORY).join(' → ')}\n\n_Samjho kya scene hai?_`);
    case 'flagguess': {
      const [f, n] = pick(FLAGS);
      games.set(chat, { type: 'flag', answer: n.toLowerCase() });
      return reply(`🏳️ *Flag Guess*\n\n${f}\n\nKaunsa mulk hai? Naam likho.`);
    }
    case 'movieguess': return reply(`🎬 *Movie Guess*\n\n_3 khwab, 1 jadoo, aur ek chhota larka_\n\nJawab likho!`);
    case 'antakshari': return reply(`🎶 *Antakshari*\n\nAakhri harf: *${pick(['A', 'M', 'S', 'T', 'K'])}*\n\nIs harf se gaana gaao!`);
    case 'storygame': return reply(`📖 *Story Game*\n\nPehli line: *${pick(['Ek raat, andheri gali me...', 'Aik chhota gaon, aik bara khwab...', 'Barish thi, aur wo akela tha...'])}*\n\nAb har member ek line add kare!`);
    case 'fmk': return reply(`😅 *FMK*\n\nFormat: ${P()}fmk Ali | Ayesha | Saqib\n\n_3 naam do, maza lo._`);
    case 'mafia': return reply(`🕵️ *Mafia*\n\nGroup me khelo: har banda DM me role bhejega, phir vote hoga.\n\n_Moderator chahiye — ${P()}start bolo._`);
    case 'simon': return reply(`🎮 *Simon Says*\n\n🟢🔴🟡🔵\n\nSequence yaad karo: *🔴 🟡 🔴 🟢*\n\nYehi bhejo!`);
    case 'high-low': {
      const n = randInt(1, 100);
      games.set(chat, { type: 'highlow', n });
      return reply(`📈 *High or Low*\n\nMaine 1-100 ka number socha hai. Batao: *high* (50+) ya *low* (1-49)?`);
    }
    case 'scratch': {
      const win = randInt(1, 100) <= 30;
      return reply(`🎟️ *Scratch card*\n\n${win ? `🎉 *JEET GAYE!* +${randInt(50, 500)} coins` : '😢 Kuch nahi mila — dobara try karo!'}`);
    }
    case 'lottery': {
      const nums = Array.from({ length: 6 }, () => randInt(1, 49)).sort((a, b) => a - b);
      return reply(`🎰 *Lottery numbers*\n\n${nums.join(' — ')}\n\n_Allah hafiz! 😄_`);
    }
    case 'loot': case 'daily': {
      const last = wallets.get(who + '_last') || 0;
      const day = 86400000;
      if (Date.now() - last < day) {
        const left = Math.ceil((day - (Date.now() - last)) / 3600000);
        return reply(`⏳ *Daily loot* pehle le chuke ho.\n\nAbhi balance: *${coins(who)} coins*\nAgla loot: ~${left} ghante baad`);
      }
      wallets.set(who + '_last', Date.now());
      const got = randInt(100, 500);
      addCoins(who, got);
      return reply(`💰 *Daily loot!*\n\n+${got} coins\n💳 Balance: *${coins(who)}*`);
    }
    case 'wallet': return reply(`👛 *Wallet*\n\n${pushname}: *${coins(who)} coins*\n\n${P()}loot — daily coins\n${P()}shop — items dekho`);
    case 'shop': return reply(`🛒 *Shop*\n\n🎁 Gift — 200 coins\n🍕 Pizza — 300 coins\n💎 Diamond — 1000 coins\n👑 VIP — 5000 coins\n\n_(Wallet system demo hai — real items nahi.)_`);
    case 'heist': {
      const win = randInt(1, 100) <= 45;
      const amt = randInt(100, 800);
      if (win) { addCoins(who, amt); return reply(`🕵️ *Heist successful!*\n\n+${amt} coins\n💳 Balance: *${coins(who)}*`); }
      addCoins(who, -200);
      return reply(`🚨 *Heist fail!*\n\nPolice ne pakad liya — 200 coins ka jurmana.\n💳 Balance: *${coins(who)}*`);
    }
    case 'fish': return reply(`🎣 *Fishing*\n\nAap ne pakra: *${pick(['Rohu 🐟', 'Surmai 🐠', 'Pomfret 🐡', 'Purana joota 🥾'])}*\n\n${P()}fish — dobara`);
    case 'hunt': return reply(`🏹 *Hunting*\n\nShikaar: *${pick(['Khargosh 🐇', 'Teetar 🐦', 'Hiran 🦌', 'Kuch nahi 😅'])}*`);
    case 'mine': {
      const found = pick(['Koyla 🪨', 'Loha ⛓️', 'Sona 🥇', 'Heera 💎', 'Kuch nahi 🕳️']);
      return reply(`⛏️ *Mining*\n\nMila: *${found}*`);
    }
    case 'farm': {
      const f = farms.get(who) || { stage: 0 };
      f.stage = Math.min(5, f.stage + 1);
      farms.set(who, f);
      const stages = ['🌱 Beej boya', '🌿 Chhota paudha', '🌾 Barha hua', '🌾 Pak gaya — kaato!', '✅ Kata liya!'];
      return reply(`🌾 *Farm*\n\n${stages[Math.min(f.stage, 4)]}\n\nStage: ${f.stage}/4`);
    }
    case 'pets': {
      const p = pets.get(who) || { name: pick(['Billu', 'Sheru', 'Motu', 'Chotu']), hunger: 50, happy: 50 };
      pets.set(who, p);
      return reply(`🐾 *Aap ka pet*\n\nNaam: *${p.name}*\n🍖 Bhookh: ${p.hunger}%\n😊 Khushi: ${p.happy}%\n\n_${P()}pets — dobara dekhne ke liye_`);
    }

    /* ---------------- real games ---------------- */
    case 'capitals': {
      const [country, city] = pick(CAPITALS);
      games.set(chat, { type: 'capital', answer: city.toLowerCase() });
      return reply(`🏛️ *Capital Quiz*\n\n${country} ka darul hukumat (capital) kaunsa hai?\n\nNaam likho.`);
    }
    case 'trivia': {
      const [q, opts, ans] = pick(QUIZ);
      games.set(chat, { type: 'trivia', answer: opts[ans].toLowerCase() });
      return reply(`🧠 *Trivia*\n\n❓ ${q}\n\n${opts.map((o, i) => `${'ABCD'[i]}. ${o}`).join('\n')}\n\n_Jawab ya option letter likho._`);
    }
    case 'guess': {
      games.set(chat, { type: 'guess', n: randInt(1, 100), tries: 0 });
      return reply(`🔢 *Number Guess*\n\n1 se 100 ke darmiyan number socha hai.\nGuess karo!`);
    }
    case 'hangman': {
      const words = ['biryani', 'karachi', 'cricket', 'chai', 'mango', 'pakistan', 'lahore', 'monsoon'];
      const w = pick(words);
      games.set(chat, { type: 'hangman', word: w, guessed: [], left: 6 });
      return reply(`🎯 *Hangman*\n\n${'_ '.repeat(w.length)}\n\n❤️ Lives: 6\n\nEk harf bhejo.`);
    }
    case 'wordle': {
      const words = ['chai', 'kitaab', 'pani', 'dost', 'khush', 'mehnat', 'dunya', 'ilm'];
      const w = pick(words);
      games.set(chat, { type: 'wordle', word: w, tries: 0 });
      return reply(`🟩 *Wordle*\n\n${w.length} harf ka lafz socha hai. 6 tries.\n\nPehla guess bhejo!`);
    }
    case 'wordchain': {
      const last = games.get(chat)?.last || pick(['a', 'b', 'm', 's']);
      games.set(chat, { type: 'chain', last });
      return reply(`🔗 *Word Chain*\n\nShuru: *${last}*\n\nAgla lafz is harf se: *${last.slice(-1).toUpperCase()}*`);
    }
    case 'mathsprint': {
      const a = randInt(10, 99), b = randInt(10, 99);
      games.set(chat, { type: 'math', answer: String(a + b) });
      return reply(`⚡ *Math Sprint*\n\n${a} + ${b} = ?\n\nJaldi jawab do!`);
    }
    case 'ttt': case 'rps': case 'chess': case 'uno': case 'connect4': case 'battleship': {
      const names = { ttt: 'Tic-Tac-Toe', rps: 'Rock Paper Scissors', chess: 'Chess', uno: 'Uno', connect4: 'Connect Four', battleship: 'Battleship' };
      if (command === 'rps') {
        const me = pick(['rock', 'paper', 'scissors']);
        const you = pick(['rock', 'paper', 'scissors']);
        const win = (me === 'rock' && you === 'scissors') || (me === 'paper' && you === 'rock') || (me === 'scissors' && you === 'paper');
        return reply(`✊ *Rock Paper Scissors*\n\n🤖 Bot: ${me}\n👤 Aap: ${you}\n\n${me === you ? '🤝 Draw!' : win ? '😢 Bot jeet gaya!' : '🎉 Aap jeet gaye!'}`);
      }
      return reply(`🎮 *${names[command]}*\n\nYe game filhal text-mode me available nahi.\n\n✅ Khelne ke liye: ${P()}trivia, ${P()}guess, ${P()}hangman, ${P()}wordle, ${P()}rps, ${P()}high-low`);
    }
    case 'blackjack': {
      const card = () => randInt(1, 11);
      const you = card() + card();
      const bot = card() + card();
      const win = you <= 21 && (bot > 21 || you > bot);
      return reply(`🃏 *Blackjack*\n\n👤 Aap: ${you}\n🤖 Bot: ${bot}\n\n${you > 21 ? '💥 Bust! Aap haar gaye.' : win ? '🎉 Aap jeet gaye!' : '😢 Bot jeeta.'}`);
    }
    case 'memory': {
      const seq = Array.from({ length: 4 }, () => pick(['🍎', '🍌', '🍇', '🍒']));
      games.set(chat, { type: 'memory', answer: seq.join('') });
      return reply(`🧠 *Memory Game*\n\n${seq.join(' ')}\n\n5 second me yaad karo, phir wohi order bhejo!`);
    }
    case '2048': return reply(`🎮 *2048*\n\nText mode me nahi. Mobile par khelo: https://play2048.co`);
    case 'sudoku': {
      const puz = [
        '5 3 . | . 7 . | . . .',
        '6 . . | 1 9 5 | . . .',
        '. 9 8 | . . . | . 6 .',
        '------+-------+------',
        '8 . . | . 6 . | . . 3',
      ];
      return reply(`🧩 *Sudoku*\n\n\`\`\`\n${puz.join('\n')}\n\`\`\`\n\n_Complete karo! (Full puzzle: sudoku.com)_`);
    }
    case 'quizduel': return reply(`⚔️ *Quiz Duel*\n\n${P()}trivia se practice karo — 1v1 mode jald aa raha hai!`);

    /* ---------------- scoreboard ---------------- */
    case 'rank': {
      const p = points(who);
      const lvl = Math.floor(p / 100) + 1;
      return reply(`🏅 *Rank*\n\n${pushname}\n⭐ Points: *${p}*\n🎖️ Level: *${lvl}*\n\n${'▰'.repeat(Math.min(10, lvl))}${'▱'.repeat(Math.max(0, 10 - lvl))}`);
    }
    case 'leaderboard': {
      const top = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (!top.length) return reply(`📊 *Leaderboard*\n\nAbhi koi points nahi. ${P()}trivia se shuru karo!`);
      return reply(`🏆 *Leaderboard*\n\n${top.map(([u, p], i) => `${['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i]} ${u} — ${p} pts`).join('\n')}`);
    }
    default:
      return reply('❓ Unknown game');
  }
};

/** Answer-catcher: hooks into every message to resolve active games. */
async function onMessage(ctx) {
  const { text, from, senderNum, pushname } = ctx;
  if (!text || text.startsWith(config.PREFIX)) return;
  const chat = from || 'chat';
  const g = games.get(chat);
  if (!g) return;
  const t = text.trim().toLowerCase();
  const who = senderNum || pushname || 'player';

  if (g.type === 'trivia' || g.type === 'flag' || g.type === 'capital') {
    if (t === g.answer || t === g.answer[0]) {
      games.delete(chat);
      const p = addPoints(who, 10);
      await ctx.reply(`✅ *Sahi jawab!* ${g.answer}\n\n+10 points (total ${p})`);
    }
  } else if (g.type === 'guess') {
    const n = parseInt(t, 10);
    if (isNaN(n)) return;
    g.tries++;
    if (n === g.n) { games.delete(chat); const p = addPoints(who, 20); await ctx.reply(`🎉 *Bilkul sahi!* Number tha ${g.n}.\n+20 points (total ${p})`); }
    else if (g.tries >= 7) { games.delete(chat); await ctx.reply(`😅 7 tries khatam! Number tha *${g.n}*.`); }
    else await ctx.reply(n < g.n ? '⬆️ Bara number try karo' : '⬇️ Chhota number try karo');
  } else if (g.type === 'math') {
    if (t === g.answer) { games.delete(chat); const p = addPoints(who, 5); await ctx.reply(`⚡ *Sahi!* +5 points (total ${p})`); }
  } else if (g.type === 'highlow') {
    if (t === 'high' || t === 'low') {
      games.delete(chat);
      const isHigh = g.n >= 50;
      const win = (t === 'high') === isHigh;
      await ctx.reply(`🔢 Number tha *${g.n}* — ${isHigh ? 'HIGH' : 'LOW'}\n\n${win ? '🎉 Aap sahi!' : '😢 Galat!'}`);
    }
  } else if (g.type === 'song') {
    if (g.answer.includes(t) || t.includes(g.answer)) { games.delete(chat); const p = addPoints(who, 15); await ctx.reply(`🎵 *Sahi gaana!* ${g.answer}\n+15 points (total ${p})`); }
  } else if (g.type === 'wordle') {
    if (t.length !== g.word.length) return;
    g.tries++;
    if (t === g.word) { games.delete(chat); const p = addPoints(who, 25); await ctx.reply(`🟩 *Wordle solved!* ${g.word}\n+25 points (total ${p})`); }
    else {
      const hint = t.split('').map((c, i) => (c === g.word[i] ? '🟩' : g.word.includes(c) ? '🟨' : '⬜')).join('');
      if (g.tries >= 6) { games.delete(chat); await ctx.reply(`😅 Tries khatam! Lafz tha *${g.word}*.`); }
      else await ctx.reply(`${hint}\n\n_Try ${g.tries}/6_`);
    }
  } else if (g.type === 'hangman') {
    const c = t[0];
    if (!/^[a-z]$/.test(c)) return;
    if (g.guessed.includes(c)) return;
    g.guessed.push(c);
    if (!g.word.includes(c)) g.left--;
    const shown = g.word.split('').map((x) => (g.guessed.includes(x) ? x : '_')).join(' ');
    if (!shown.includes('_')) { games.delete(chat); const p = addPoints(who, 15); await ctx.reply(`🎉 *Word mil gaya:* ${g.word}\n+15 points (total ${p})`); }
    else if (g.left <= 0) { games.delete(chat); await ctx.reply(`💀 *Game over!* Lafz tha *${g.word}*.`); }
    else await ctx.reply(`${shown}\n❤️ Lives: ${g.left}\n_Guessed: ${g.guessed.join(', ')}_`);
  } else if (g.type === 'memory') {
    if (t.replace(/\s/g, '') === g.answer.replace(/\s/g, '')) { games.delete(chat); const p = addPoints(who, 10); await ctx.reply(`🧠 *Perfect memory!* +10 points (total ${p})`); }
  } else if (g.type === 'chain') {
    if (t[0] === g.last.slice(-1)) { g.last = t; await ctx.reply(`✅ *${t}* — agla lafz *${t.slice(-1).toUpperCase()}* se!`); }
  }
}

module.exports = {
  commands: [
    'paranoia', 'nhie', 'couple', 'rank', 'leaderboard', 'wallet', 'shop', 'trivia', 'guess', 'hangman',
    'lottery', 'scratch', 'loot', 'heist', 'fish', 'hunt', 'mine', 'farm', 'pets', 'mathsprint', 'wordle',
    'wordchain', 'antakshari', 'songguess', 'emojistory', 'movieguess', 'flagguess', 'capitals', 'storygame',
    'spinthebottle', 'blackjack', 'high-low', 'memory', '2048', 'sudoku', 'mafia', 'simon',
    // extras that belong in this family
    'daily', 'ttt', 'rps', 'chess', 'uno', 'connect4', 'battleship', 'quizduel', 'fmk',
  ],
  category: '🎮 GAMES',
  handler,
  onMessage,
};
