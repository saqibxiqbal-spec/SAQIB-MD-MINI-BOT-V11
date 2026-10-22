#!/usr/bin/env node
/**
 * SAQIB MD — Atlas IP allow-list helper
 * -------------------------------------
 * Adds an IP entry (default 0.0.0.0/0 = "allow from anywhere") to a MongoDB
 * Atlas project's Network Access list, using the Atlas Admin API.
 *
 * IMPORTANT: the Atlas Admin API uses HTTP **Digest** auth. Node's http
 * `auth` option sends Basic auth, which Atlas rejects with 401. So this
 * script shells out to `curl --digest`, which is present on every host that
 * runs this bot (and on the Docker image via ca-certificates/curl).
 *
 * Requires an API key that has GROUP_OWNER (or GROUP_CLUSTER_MANAGER) on the
 * project. An ORG_MEMBER-only key cannot do this.
 *
 * Usage:
 *   node scripts/atlas-allow-ip.js <PUBLIC_KEY> <PRIVATE_KEY> [GROUP_ID] [CIDR]
 *
 * Defaults:
 *   GROUP_ID = 6ad900ee1fbce75af3216e3b   (SAQIB MD project)
 *   CIDR     = 0.0.0.0/0
 */
const { execFileSync } = require('child_process');

const PUB = process.argv[2];
const PRIV = process.argv[3];
const GROUP = process.argv[4] || '6ad900ee1fbce75af3216e3b';
const CIDR = process.argv[5] || '0.0.0.0/0';

if (!PUB || !PRIV) {
  console.error('Usage: node scripts/atlas-allow-ip.js <PUBLIC_KEY> <PRIVATE_KEY> [GROUP_ID] [CIDR]');
  process.exit(2);
}

const BASE = 'https://cloud.mongodb.com/api/atlas/v1.0';

/** Run a digest-authenticated request through curl. Returns { status, body }. */
function atlas(method, path, jsonBody) {
  const args = [
    '-s', '--digest', '-u', `${PUB}:${PRIV}`,
    '-X', method,
    `${BASE}${path}`,
    '-H', 'Accept: application/json',
    '-H', 'Content-Type: application/json',
    '-w', '\n__HTTP__%{http_code}',
  ];
  if (jsonBody) args.push('-d', JSON.stringify(jsonBody));
  let out = '';
  try {
    out = execFileSync('curl', args, { encoding: 'utf8' });
  } catch (e) {
    out = (e.stdout || '') + '\n__HTTP__000';
  }
  const m = out.match(/\n__HTTP__(\d{3})\s*$/);
  const status = m ? Number(m[1]) : 0;
  const body = out.replace(/\n__HTTP__\d{3}\s*$/, '');
  return { status, body };
}

(async () => {
  console.log(`→ Project: ${GROUP}`);
  console.log(`→ Allowing: ${CIDR}\n`);

  const list = atlas('GET', `/groups/${GROUP}/accessList`);
  if (list.status === 401 || list.status === 403) {
    console.error('❌ This API key cannot access the project (needs GROUP_OWNER).');
    console.error('   Response:', list.body.slice(0, 300));
    process.exit(1);
  }

  console.log('Current entries:');
  try {
    const j = JSON.parse(list.body);
    for (const e of j.results || []) {
      console.log('  •', e.cidrBlock || e.ipAddress, e.comment ? `(${e.comment})` : '');
    }
    if (!(j.results || []).length) console.log('  (none)');
    if ((j.results || []).some((e) => (e.cidrBlock || '') === CIDR)) {
      console.log(`\n✅ ${CIDR} is ALREADY allowed — nothing to do.`);
      return;
    }
  } catch { /* ignore */ }

  const add = atlas('POST', `/groups/${GROUP}/accessList`, [
    { cidrBlock: CIDR, comment: 'SAQIB MD bot — allow all hosts' },
  ]);
  console.log('\nAdd result:', add.status);

  if (add.status === 200 || add.status === 201) {
    console.log('\n✅ IP allow-list updated. Atlas needs ~1–2 minutes to apply it.');
    console.log('   Then verify with:  node scripts/test-mongo.js "<MONGODB_URI>"');
  } else {
    console.log(add.body.slice(0, 400));
    console.log('\n❌ Failed — see response above.');
    process.exit(1);
  }
})();
