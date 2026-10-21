#!/usr/bin/env node
/**
 * SAQIB MD — MongoDB connection tester
 * -----------------------------------
 * Usage:
 *   node scripts/test-mongo.js "mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority"
 *   (or) set MONGODB_URI in .env and run:  node scripts/test-mongo.js
 *
 * It connects, pings the server, writes + reads a probe document, then
 * reports OK / the exact error. Nothing is left behind.
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = (process.argv[2] || process.env.MONGODB_URI || '').trim();
const dbName = (process.env.MONGODB_DB || 'saqib_md').trim();

(async () => {
  if (!uri) {
    console.error('\n✖ No URI. Pass it as an argument or set MONGODB_URI in .env\n');
    process.exit(2);
  }
  const masked = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  console.log('→ Connecting to:', masked);
  console.log('→ Database    :', dbName);

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 12000 });
  try {
    await client.connect();
    await client.db(dbName).command({ ping: 1 });
    console.log('✔ Ping OK — server reachable');

    const col = client.db(dbName).collection('_saqib_selftest');
    await col.updateOne({ _id: 'probe' }, { $set: { at: new Date() } }, { upsert: true });
    const doc = await col.findOne({ _id: 'probe' });
    console.log('✔ Write/Read OK — roundtrip:', doc && doc.at ? doc.at.toISOString() : '(none)');

    const cols = await client.db(dbName).listCollections().toArray();
    console.log('✔ Collections:', cols.map((c) => c.name).join(', ') || '(empty)');

    await col.deleteOne({ _id: 'probe' });
    console.log('\n✅ MONGODB IS READY. Put this in your .env / host env:\n');
    console.log('   MONGODB_URI=' + uri);
    console.log('   MONGODB_DB=' + dbName + '\n');
  } catch (e) {
    console.error('\n✖ FAILED:', e && e.message ? e.message : e);
    console.error('\nCommon fixes:');
    console.error('  • Atlas → Network Access → allow 0.0.0.0/0 (or your host IP)');
    console.error('  • Atlas → Database Access → user has readWrite on the DB');
    console.error('  • Password must be URL-encoded (e.g. @ -> %40)');
    console.error('  • Copy the string from Atlas → Database → Connect → Drivers\n');
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => {});
  }
})();
