/**
 * Local MongoDB fallback for SAQIB MD.
 * Used when the cloud URI (MONGODB_URI) is unreachable, e.g. Atlas rejects
 * this host's IP with "SSL alert number 80".
 * Data is stored on disk in ./mongo-data so it survives bot restarts.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.LOCAL_MONGO_PORT || 27017);
const DB_PATH = path.join(__dirname, 'mongo-data');

(async () => {
  fs.mkdirSync(DB_PATH, { recursive: true });
  const srv = await MongoMemoryServer.create({
    instance: { port: PORT, dbPath: DB_PATH, storageEngine: 'wiredTiger' },
    binary: { downloadDir: path.join(__dirname, '.mongo-bin') },
  });
  console.log('[LOCAL MONGO] up on', srv.getUri(), '| data:', DB_PATH);
  const stop = async () => {
    try { await srv.stop({ doCleanup: false, force: true }); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((e) => {
  console.error('[LOCAL MONGO] failed:', e.message);
  process.exit(1);
});
