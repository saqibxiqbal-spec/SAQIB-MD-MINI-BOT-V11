#!/usr/bin/env node
/**
 * Verifies the "settings don't stick" fix (Bug 4).
 *
 * Scenario that used to FAIL:
 *   • The host has a toggle in its env, e.g. STATUSLIKE=false.
 *   • The owner turns it ON from WhatsApp: `.statuslike on`.
 *   • The process restarts (redeploy).
 *   • OLD behaviour: the env value (false) was authoritative, so the toggle
 *     went back OFF -> "phir dobara on karna padta hai".
 *   • NEW behaviour: the key is marked "dirty" (changed at runtime) and the
 *     saved value ALWAYS wins -> the toggle STAYS ON.
 *
 * Also checks the remote store (SETTINGS_URL) used on ephemeral-disk hosts where
 * the local disk is wiped on every restart.
 *
 * Run: node test/settings-persist.js
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const TMP = path.join(os.tmpdir(), 'saqib-settings-test');
const SESSION_DIR = path.join(TMP, 'session');
const FILE = path.join(TMP, 'saqib-settings.json');

function run(phase, extraEnv = {}, timeout = 40000) {
  const r = spawnSync(process.execPath, [__filename, phase], {
    cwd: ROOT,
    timeout,
    env: {
      ...process.env,
      SESSION_DIR,
      // Simulate a host that has these toggles pinned in its env.
      STATUSLIKE: 'false',
      ANTIDELETE: 'false',
      AUTO_REACT: 'false',
      ...extraEnv,
    },
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`phase ${phase} failed:\n${r.stderr || r.stdout}`);
  return (r.stdout || '').trim().split('\n').pop();
}

/* ------------------------------- child phases ---------------------------- */
if (process.argv[2] === 'toggle') {
  const config = require('../config');
  const settings = require('../lib/settings');
  settings.load();
  config.STATUSLIKE = true;      // `.statuslike on`
  config.ANTIDELETE = true;      // `.antidelete on`
  settings.save();
  console.log(JSON.stringify({ statuslike: config.STATUSLIKE, antidelete: config.ANTIDELETE }));
  process.exit(0);
}

if (process.argv[2] === 'boot') {
  const config = require('../config');
  const settings = require('../lib/settings');
  settings.load();
  console.log(JSON.stringify({ statuslike: config.STATUSLIKE, antidelete: config.ANTIDELETE }));
  process.exit(0);
}

if (process.argv[2] === 'remote-create') {
  (async () => {
    const settings = require('../lib/settings');
    console.log(await settings.createRemoteStore());
    process.exit(0);
  })().catch((e) => { console.error(e); process.exit(1); });
}

if (process.argv[2] === 'remote-push') {
  (async () => {
    const config = require('../config');
    const settings = require('../lib/settings');
    config.STATUSVIEW = true;      // `.statusview on`
    config.AUTOSTATUS = true;
    settings.save();               // debounced remote PUT
    await new Promise((r) => setTimeout(r, 2500));
    console.log(JSON.stringify({ pushed: true, statusview: config.STATUSVIEW }));
    process.exit(0);
  })().catch((e) => { console.error(e); process.exit(1); });
}

if (process.argv[2] === 'remote-read') {
  (async () => {
    const config = require('../config');
    const settings = require('../lib/settings');
    const ok = await settings.loadRemote();
    console.log(JSON.stringify({ ok, statusview: config.STATUSVIEW, autostatus: config.AUTOSTATUS }));
    process.exit(0);
  })().catch((e) => { console.error(e); process.exit(1); });
}

/* ------------------------------- runner ---------------------------------- */
(async () => {
  if (process.argv[2]) return; // a child phase was requested — don't recurse
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(SESSION_DIR, { recursive: true });

  let pass = 0, fail = 0;
  const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  \u2705 ${name}`); }
    else { fail++; console.log(`  \u274c ${name} ${extra}`); }
  };

  console.log('\n1) local persistence (toggle must survive a restart with env=false)');
  const afterToggle = JSON.parse(run('toggle'));
  check('toggle turned ON in-process', afterToggle.statuslike === true && afterToggle.antidelete === true, JSON.stringify(afterToggle));
  check('settings file written', fs.existsSync(FILE));
  const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  check('file marks keys dirty', Array.isArray(saved._dirty) && saved._dirty.includes('STATUSLIKE') && saved._dirty.includes('ANTIDELETE'), JSON.stringify(saved._dirty));
  const afterBoot = JSON.parse(run('boot'));
  check('STATUSLIKE STILL ON after restart (env said false)', afterBoot.statuslike === true, JSON.stringify(afterBoot));
  check('ANTIDELETE STILL ON after restart (env said false)', afterBoot.antidelete === true, JSON.stringify(afterBoot));

  console.log('\n2) remote store round-trip (SETTINGS_URL on ephemeral-disk hosts)');
  try {
    const url = run('remote-create');
    check('store created', /^https:\/\/api\.restful-api\.dev\/objects\/.+/.test(url), url);
    // fresh disk (simulate a restart) then push + read back
    fs.rmSync(FILE, { force: true });
    run('remote-push', { SETTINGS_URL: url });
    fs.rmSync(FILE, { force: true });
    const back = JSON.parse(run('remote-read', { SETTINGS_URL: url }));
    check('remote load succeeded', back.ok === true, JSON.stringify(back));
    check('STATUSVIEW restored from remote', back.statusview === true, JSON.stringify(back));
    check('AUTOSTATUS restored from remote', back.autostatus === true, JSON.stringify(back));
  } catch (e) { fail++; console.log('  \u274c remote test error: ' + e.message); }

  console.log(`\n${fail === 0 ? '\u2705 ALL PASS' : '\u274c FAILURES'} \u2014 ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
