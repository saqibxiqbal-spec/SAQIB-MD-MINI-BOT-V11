/**
 * TEXTGEN — small text generators & one-liners
 */
const config = require('../config');
const { pick, randInt } = require('../lib/helpers');

const P = () => config.PREFIX;

const FORTUNES = [
  'Aaj ka din aap ke liye khushiyon bhara hai — ek purana dost rabta karega.',
  'Koi achi khabar jald aane wali hai. Sabr ka phal meetha hoga.',
  'Paise ka mamla hal hoga, magar soch samajh kar kharch karna.',
  'Aaj kisi ki madad karo — badle me khushi milegi.',
  'Aik chhoti si koshish bara badlav layegi.',
  'Jo dhoond rahe ho wo qareeb hi hai — nazar theek karo.',
  'Aaj kisi purani ghalti ka sabak kaam aayega.',
  'Mehnat ka sila zaroor milega, waqt se pehle nahi.',
];
const ADVICE = [
  'Jo aaj kar sakte ho, kal par na chhoro.',
  'Gussa aaye to 10 tak ginti karo.',
  'Har rishte me sunna bolne se zyada zaroori hai.',
  'Paise bachao — kal ka bharosa nahi.',
  'Sehat pehle, baqi sab baad me.',
  'Jo tumhare paas hai us par shukar karo.',
  'Naye logon se seekho, purane dost na chhoro.',
  'Sona 8 ghante — ye invest hai, laziness nahi.',
];
const CONSPIRACY = [
  'Kabooter asal me sarkari jasoos hain — isi liye har gali me milte hain.',
  'WiFi router raat ko slow isliye hota hai ke wo tumhari baatein sun raha hota hai.',
  'Chai ke bina meeting ka koi matlab nahi — ye corporate conspiracy hai.',
  'Monday ka wajood calendar companies ne banaya hai taake weekends chhote lagen.',
  'Biryani me aloo daalne ka asal maqsad chawal bachana tha.',
];
const DADJOKES = [
  'Maine apne fridge ko kaha ruk ja — wo barf ban gaya. 🧊',
  'Bijli ka bill itna zyada kyun? Kyunke wo charged tha. ⚡',
  'Wifi ne mujhe kyun chhora? Kyunke connection weak tha. 📶',
  'Main bhookha tha, to khana kha liya — ab main "kha liya" hoon. 🍽️',
  'Chai ne kaha: tum meri cup of tea ho. ☕',
  'Darakht ne kaha mujhe akela chhor do — main "ped" hoon. 🌳',
];

const handler = async (ctx) => {
  const { command, reply } = ctx;
  switch (command) {
    case 'fortune': return reply(`🔮 *Aaj ki taqdeer*\n\n${pick(FORTUNES)}`);
    case 'advice': return reply(`💡 *Mashwara*\n\n${pick(ADVICE)}`);
    case 'conspiracy': return reply(`👽 *Conspiracy theory*\n\n${pick(CONSPIRACY)}\n\n_100% mazaak hai_ 😄`);
    case 'dadjoke': return reply(`😄 *Dad joke*\n\n${pick(DADJOKES)}`);
    default: return reply('❓ Unknown command');
  }
};

module.exports = {
  commands: ['fortune', 'advice', 'conspiracy', 'dadjoke'],
  category: '✍️ TEXT',
  handler,
};
