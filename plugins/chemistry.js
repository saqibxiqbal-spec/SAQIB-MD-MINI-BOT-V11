/**
 * CHEMISTRY — all 118 elements of the periodic table.
 * 100% offline data — no API calls, no credit used.
 */
const config = require('../config');
const { pick } = require('../lib/helpers');

const P = () => config.PREFIX;

/** symbol -> [name, atomicNumber, atomicMass, category] */
const EL = {
  "H": ["Hydrogen", 1, "1.008", "Nonmetal"],
  "He": ["Helium", 2, "4.0026", "Noble Gas"],
  "Li": ["Lithium", 3, "6.94", "Alkali Metal"],
  "Be": ["Beryllium", 4, "9.0122", "Alkaline Earth"],
  "B": ["Boron", 5, "10.81", "Metalloid"],
  "C": ["Carbon", 6, "12.011", "Nonmetal"],
  "N": ["Nitrogen", 7, "14.007", "Nonmetal"],
  "O": ["Oxygen", 8, "15.999", "Nonmetal"],
  "F": ["Fluorine", 9, "18.998", "Halogen"],
  "Ne": ["Neon", 10, "20.180", "Noble Gas"],
  "Na": ["Sodium", 11, "22.990", "Alkali Metal"],
  "Mg": ["Magnesium", 12, "24.305", "Alkaline Earth"],
  "Al": ["Aluminium", 13, "26.982", "Post-transition"],
  "Si": ["Silicon", 14, "28.085", "Metalloid"],
  "P": ["Phosphorus", 15, "30.974", "Nonmetal"],
  "S": ["Sulfur", 16, "32.06", "Nonmetal"],
  "Cl": ["Chlorine", 17, "35.45", "Halogen"],
  "Ar": ["Argon", 18, "39.948", "Noble Gas"],
  "K": ["Potassium", 19, "39.098", "Alkali Metal"],
  "Ca": ["Calcium", 20, "40.078", "Alkaline Earth"],
  "Sc": ["Scandium", 21, "44.956", "Transition Metal"],
  "Ti": ["Titanium", 22, "47.867", "Transition Metal"],
  "V": ["Vanadium", 23, "50.942", "Transition Metal"],
  "Cr": ["Chromium", 24, "51.996", "Transition Metal"],
  "Mn": ["Manganese", 25, "54.938", "Transition Metal"],
  "Fe": ["Iron", 26, "55.845", "Transition Metal"],
  "Co": ["Cobalt", 27, "58.933", "Transition Metal"],
  "Ni": ["Nickel", 28, "58.693", "Transition Metal"],
  "Cu": ["Copper", 29, "63.546", "Transition Metal"],
  "Zn": ["Zinc", 30, "65.38", "Transition Metal"],
  "Ga": ["Gallium", 31, "69.723", "Post-transition"],
  "Ge": ["Germanium", 32, "72.630", "Metalloid"],
  "As": ["Arsenic", 33, "74.922", "Metalloid"],
  "Se": ["Selenium", 34, "78.971", "Nonmetal"],
  "Br": ["Bromine", 35, "79.904", "Halogen"],
  "Kr": ["Krypton", 36, "83.798", "Noble Gas"],
  "Rb": ["Rubidium", 37, "85.468", "Alkali Metal"],
  "Sr": ["Strontium", 38, "87.62", "Alkaline Earth"],
  "Y": ["Yttrium", 39, "88.906", "Transition Metal"],
  "Zr": ["Zirconium", 40, "91.224", "Transition Metal"],
  "Nb": ["Niobium", 41, "92.906", "Transition Metal"],
  "Mo": ["Molybdenum", 42, "95.95", "Transition Metal"],
  "Tc": ["Technetium", 43, "98", "Transition Metal"],
  "Ru": ["Ruthenium", 44, "101.07", "Transition Metal"],
  "Rh": ["Rhodium", 45, "102.91", "Transition Metal"],
  "Pd": ["Palladium", 46, "106.42", "Transition Metal"],
  "Ag": ["Silver", 47, "107.87", "Transition Metal"],
  "Cd": ["Cadmium", 48, "112.41", "Transition Metal"],
  "In": ["Indium", 49, "114.82", "Post-transition"],
  "Sn": ["Tin", 50, "118.71", "Post-transition"],
  "Sb": ["Antimony", 51, "121.76", "Metalloid"],
  "Te": ["Tellurium", 52, "127.60", "Metalloid"],
  "I": ["Iodine", 53, "126.90", "Halogen"],
  "Xe": ["Xenon", 54, "131.29", "Noble Gas"],
  "Cs": ["Caesium", 55, "132.91", "Alkali Metal"],
  "Ba": ["Barium", 56, "137.33", "Alkaline Earth"],
  "La": ["Lanthanum", 57, "138.91", "Lanthanide"],
  "Ce": ["Cerium", 58, "140.12", "Lanthanide"],
  "Pr": ["Praseodymium", 59, "140.91", "Lanthanide"],
  "Nd": ["Neodymium", 60, "144.24", "Lanthanide"],
  "Pm": ["Promethium", 61, "145", "Lanthanide"],
  "Sm": ["Samarium", 62, "150.36", "Lanthanide"],
  "Eu": ["Europium", 63, "151.96", "Lanthanide"],
  "Gd": ["Gadolinium", 64, "157.25", "Lanthanide"],
  "Tb": ["Terbium", 65, "158.93", "Lanthanide"],
  "Dy": ["Dysprosium", 66, "162.50", "Lanthanide"],
  "Ho": ["Holmium", 67, "164.93", "Lanthanide"],
  "Er": ["Erbium", 68, "167.26", "Lanthanide"],
  "Tm": ["Thulium", 69, "168.93", "Lanthanide"],
  "Yb": ["Ytterbium", 70, "173.05", "Lanthanide"],
  "Lu": ["Lutetium", 71, "174.97", "Lanthanide"],
  "Hf": ["Hafnium", 72, "178.49", "Transition Metal"],
  "Ta": ["Tantalum", 73, "180.95", "Transition Metal"],
  "W": ["Tungsten", 74, "183.84", "Transition Metal"],
  "Re": ["Rhenium", 75, "186.21", "Transition Metal"],
  "Os": ["Osmium", 76, "190.23", "Transition Metal"],
  "Ir": ["Iridium", 77, "192.22", "Transition Metal"],
  "Pt": ["Platinum", 78, "195.08", "Transition Metal"],
  "Au": ["Gold", 79, "196.97", "Transition Metal"],
  "Hg": ["Mercury", 80, "200.59", "Transition Metal"],
  "Tl": ["Thallium", 81, "204.38", "Post-transition"],
  "Pb": ["Lead", 82, "207.2", "Post-transition"],
  "Bi": ["Bismuth", 83, "208.98", "Post-transition"],
  "Po": ["Polonium", 84, "209", "Post-transition"],
  "At": ["Astatine", 85, "210", "Halogen"],
  "Rn": ["Radon", 86, "222", "Noble Gas"],
  "Fr": ["Francium", 87, "223", "Alkali Metal"],
  "Ra": ["Radium", 88, "226", "Alkaline Earth"],
  "Ac": ["Actinium", 89, "227", "Actinide"],
  "Th": ["Thorium", 90, "232.04", "Actinide"],
  "Pa": ["Protactinium", 91, "231.04", "Actinide"],
  "U": ["Uranium", 92, "238.03", "Actinide"],
  "Np": ["Neptunium", 93, "237", "Actinide"],
  "Pu": ["Plutonium", 94, "244", "Actinide"],
  "Am": ["Americium", 95, "243", "Actinide"],
  "Cm": ["Curium", 96, "247", "Actinide"],
  "Bk": ["Berkelium", 97, "247", "Actinide"],
  "Cf": ["Californium", 98, "251", "Actinide"],
  "Es": ["Einsteinium", 99, "252", "Actinide"],
  "Fm": ["Fermium", 100, "257", "Actinide"],
  "Md": ["Mendelevium", 101, "258", "Actinide"],
  "No": ["Nobelium", 102, "259", "Actinide"],
  "Lr": ["Lawrencium", 103, "266", "Actinide"],
  "Rf": ["Rutherfordium", 104, "267", "Transition Metal"],
  "Db": ["Dubnium", 105, "268", "Transition Metal"],
  "Sg": ["Seaborgium", 106, "269", "Transition Metal"],
  "Bh": ["Bohrium", 107, "270", "Transition Metal"],
  "Hs": ["Hassium", 108, "269", "Transition Metal"],
  "Mt": ["Meitnerium", 109, "278", "Unknown"],
  "Ds": ["Darmstadtium", 110, "281", "Unknown"],
  "Rg": ["Roentgenium", 111, "282", "Unknown"],
  "Cn": ["Copernicium", 112, "285", "Transition Metal"],
  "Nh": ["Nihonium", 113, "286", "Unknown"],
  "Fl": ["Flerovium", 114, "289", "Unknown"],
  "Mc": ["Moscovium", 115, "290", "Unknown"],
  "Lv": ["Livermorium", 116, "293", "Unknown"],
  "Ts": ["Tennessine", 117, "294", "Unknown"],
  "Og": ["Oganesson", 118, "294", "Unknown"],
};

const SYMS = Object.keys(EL);
const BY_NAME = {};
for (const [s, v] of Object.entries(EL)) BY_NAME[v[0].toLowerCase()] = s;
// lowercase symbol -> proper-case key ("he" -> "He", "fe" -> "Fe"). The bare
// element commands are registered lowercased, so we MUST look them up this way
// (a plain `.toUpperCase()` misses every two-letter symbol).
const BY_SYM = {};
for (const s of SYMS) BY_SYM[s.toLowerCase()] = s;

function card(sym) {
  const [name, num, mass, cat] = EL[sym];
  return (
    `⚗️ *${name.toUpperCase()} (${sym})*\n` +
    `━━━━━━━━━━━━━━━\n` +
    `▪️ Atomic number: *${num}*\n` +
    `▪️ Atomic mass: ${mass} u\n` +
    `▪️ Category: ${cat}\n` +
    `▪️ Symbol: ${sym}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `_${P()}elements · ${P()}element ${sym}_`
  );
}

const handler = async (ctx) => {
  const { command, arg, reply } = ctx;
  const q = String(arg || '').trim();

  if (command === 'elementlist' || command === 'periodictable') {
    return reply(
      `⚗️ *PERIODIC TABLE (${SYMS.length})*\n━━━━━━━━━━━━━━━\n` +
      SYMS.map((s) => `\`${EL[s][0]}\``).join(' · ')
    );
  }

  if (command === 'element') {
    if (!q) return reply(`⚗️ Element ka naam ya symbol likho.\nExample: \`${P()}element gold\``);
    const key = q.charAt(0).toUpperCase() + q.slice(1).toLowerCase();
    if (EL[key]) return reply(card(key));
    if (EL[q.toUpperCase()]) return reply(card(q.toUpperCase()));
    if (BY_NAME[q.toLowerCase()]) return reply(card(BY_NAME[q.toLowerCase()]));
    const hits = SYMS.filter((s) => EL[s][0].toLowerCase().includes(q.toLowerCase()));
    if (hits.length === 1) return reply(card(hits[0]));
    if (hits.length) return reply(`🔍 ${hits.map((h) => `\`${P()}element ${h}\``).join(' · ')}`);
    return reply(`❌ \`${q}\` nahi mila. \`${P()}elementlist\` try karo.`);
  }

  // field lookups
  if (command === 'atomicnumber' || command === 'atomicmass' || command === 'elementcategory') {
    if (!q) return reply(`❓ Element likho. Example: \`${P()}${command} gold\``);
    let sym = EL[q] ? q : (BY_SYM[q.toLowerCase()] || BY_NAME[q.toLowerCase()]);
    if (!sym) sym = SYMS.find((s) => EL[s][0].toLowerCase().includes(q.toLowerCase()));
    if (!sym) return reply(`❌ \`${q}\` nahi mila.`);
    const [name, num, mass, cat] = EL[sym];
    const v = command === 'atomicnumber' ? num : command === 'atomicmass' ? mass + ' u' : cat;
    const label = command === 'atomicnumber' ? 'Atomic number' : command === 'atomicmass' ? 'Atomic mass' : 'Category';
    return reply(`⚗️ *${name} (${sym})*\n▪️ ${label}: *${v}*`);
  }

  // one command per element symbol: .h .he .au … (lowercased)
  if (command.length <= 3 && BY_SYM[command]) return reply(card(BY_SYM[command]));

  return reply(`❓ Element command samajh nahi aaya. \`${P()}elementlist\` dekho.`);
};

// Element symbols whose bare name collides with a real command in another
// plugin. Those plugins must win, so we never register the bare symbol here:
//   s  -> media.js      (.s  = sticker)
//   cd -> tools.js      (.cd = countdown)
//   no -> reactions.js  (.no = ❌ reaction)
//   db -> owner.js      (.db = database status)
// The element is still reachable via `.element s` / `.element cd` / `.element no` / `.element db`.
const RESERVED = new Set(['s', 'cd', 'no', 'db']);

module.exports = {
  commands: ['element', 'elementlist', 'periodictable', 'atomicnumber', 'atomicmass', 'elementcategory',
    ...SYMS.map((s) => s.toLowerCase()).filter((c) => !RESERVED.has(c))],
  category: '🔬 SCIENCE',
  handler,
};
