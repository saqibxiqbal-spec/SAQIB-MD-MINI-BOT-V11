// Pre-generate the MYTH images at boot so the FIRST user hit is instant instead
// of 8-14s. Runs 25s after start, one image at a time, so it never competes with
// a real user's request during boot.
const img = require('../lib/imagegen.js');
const myth = require('../plugins/myth.js');

const PROMPTS = {
  alchemist: 'an alchemist in a laboratory, glowing potions',
  alieninvasion: 'alien invasion over a city, sci-fi',
  astral: 'astral projection, soul floating in space',
  atlantis: 'the lost city of atlantis underwater',
  centaur: 'a centaur warrior in a forest',
  conjurer: 'a conjurer casting spells, magic circles',
  cyborg: 'a cyborg warrior, futuristic armor',
  diviner: 'a diviner reading the future, crystal ball',
  dragonfire: 'a dragon breathing fire over mountains',
  earthquake: 'a massive earthquake splitting the earth',
  enchanter: 'an enchanter weaving magic runes',
  fairy: 'a glowing fairy in an enchanted forest',
  gladiator: 'a gladiator in the roman arena',
  griffin: 'a majestic griffin, half eagle half lion',
  guru: 'a wise guru meditating on a mountain',
  hurricane: 'a giant hurricane seen from space',
  illusionist: 'an illusionist performing a grand trick',
  knight: 'a knight in shining armor',
  mayan: 'a mayan temple in the jungle',
  medium: 'spiritual medium contacting spirits, seance',
  mermaid: 'a mermaid in a coral reef',
  monk: 'a monk in a mountain monastery',
  mystic: 'a mystic with glowing aura, ancient temple',
  necromancer: 'a necromancer raising the dead',
  ninja: 'a ninja on a rooftop at night',
};

(async () => {
  if (String(process.env.WARM_IMAGES || '1') === '0') return;
  await new Promise((r) => setTimeout(r, 45000));
  const names = Object.keys(PROMPTS).filter((n) => myth.commands.includes(n));
  console.log('[warm] pre-generating', names.length, 'myth images');
  for (const n of names) {
    try {
      await img.generateImage(`${PROMPTS[n]}, highly detailed digital art, epic cinematic lighting, 4k`,
        { width: 1024, height: 1024 });
      console.log('[warm] ok', n);
    } catch { /* skip */ }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log('[warm] done');
})();
