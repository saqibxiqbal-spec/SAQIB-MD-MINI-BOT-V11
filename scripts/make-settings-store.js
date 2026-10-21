#!/usr/bin/env node
/**
 * SAQIB MD — create a persistent settings store
 * ---------------------------------------------
 * On hosts with an EPHEMERAL disk (most free tiers) the local
 * saqib-settings.json is wiped on every restart/redeploy, so a toggle you turn
 * ON with a WhatsApp command (.statuslike on, .antidelete on, …) goes back OFF
 * after the next restart.
 *
 * This script creates a free, no-signup JSON store and prints the URL. Paste
 * that URL into the host's env as SETTINGS_URL and every toggle will be saved
 * there (and restored on boot) — so your settings STICK.
 *
 *   node scripts/make-settings-store.js
 *
 * Output:
 *   SETTINGS_URL=https://api.restful-api.dev/objects/xxxx
 *
 * Then set it on your host:
 *   • Any host: add SETTINGS_URL in your host environment / config vars
 *   • Railway: Variables ▸ New Variable
 *   • Render : Environment ▸ Add Environment Variable
 *
 * You can also create the store from the web portal (Settings card ▸ button).
 */
const settings = require('../lib/settings');
const config = require('../config');

(async () => {
  console.log(`\n${config.BOT_NAME} — settings store creator`);
  console.log('--------------------------------------');
  console.log(`owner     : ${config.OWNER_NUMBER || '(not set)'}`);
  console.log(`local file: ${settings.FILE}`);
  if (settings.remoteEnabled()) {
    console.log(`remote    : already configured -> ${settings.status().remote}`);
    console.log('\nNothing to do — SETTINGS_URL is already set. \u2705\n');
    return;
  }
  process.stdout.write('creating a free JSON store');
  const tick = setInterval(() => process.stdout.write('.'), 500);
  try {
    const url = await settings.createRemoteStore();
    clearInterval(tick);
    console.log(' done.\n');
    console.log('Paste this into your host env as SETTINGS_URL:\n');
    console.log(`SETTINGS_URL=${url}\n`);
    console.log('After adding it, restart the app once. Every toggle will then persist.\n');
  } catch (e) {
    clearInterval(tick);
    console.error('\n\u274c failed:', e?.message || e);
    console.error('Tip: you can also click "Create persistent settings store" in the web portal.\n');
    process.exitCode = 1;
  }
})();
