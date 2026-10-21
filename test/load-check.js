/** Load check: does lib/bot.js (with the session-guard fix) parse and load? */
const bot = require('../lib/bot');
console.log('bot.js loads OK — exports:', Object.keys(bot).join(', '));
console.log('sessions map size:', bot.sessions.size);
process.exit(0);
