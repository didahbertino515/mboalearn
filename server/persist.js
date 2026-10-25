// Sauvegarde de la base SQLite et des fichiers envoyés dans PostgreSQL (DATABASE_URL).
// Permet de conserver les données sur un hébergement gratuit dont le disque est effacé
// à chaque redémarrage (Render free) : la base est restaurée au démarrage, puis recopiée
// toutes les 20 secondes si elle a changé, et une dernière fois à l'arrêt du serveur.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const SNAPSHOT_EVERY_MS = 20 * 1000;
let pool = null;
let lastChanges = -1;
let saving = null;

function enabled() { return !!process.env.DATABASE_URL; }

function getPool() {
  if (!pool) {
    const { Pool } = require('pg');
    const url = process.env.DATABASE_URL;
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /host=\/|@\/|%2F/.test(url);
    pool = new Pool({ connectionString: url, max: 3, ssl: local ? false : { rejectUnauthorized: false } });
    pool.on('error', (e) => console.error('[persist] erreur PostgreSQL', e.message));
  }
  return pool;
}

const dbFile = () => path.join(config.dataDir, 'mboalearn.db');

// À appeler AVANT d'ouvrir la base SQLite
async function restore() {
  if (!enabled()) return;
  const p = getPool();
  await p.query(`CREATE TABLE IF NOT EXISTS mboalearn_snapshots (id INT PRIMARY KEY, data BYTEA NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await p.query(`CREATE TABLE IF NOT EXISTS mboalearn_files (name TEXT PRIMARY KEY, mime TEXT NOT NULL, data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const r = await p.query('SELECT data, updated_at FROM mboalearn_snapshots WHERE id = 1');
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (r.rows[0]) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile() + suffix, { force: true });
    fs.writeFileSync(dbFile(), r.rows[0].data);
    console.log(`[persist] base restaurée depuis PostgreSQL (${Math.round(r.rows[0].data.length / 1024)} Ko, sauvegarde du ${r.rows[0].updated_at.toISOString()})`);
  } else {
    console.log('[persist] aucune sauvegarde trouvée : nouvelle base');
  }
}

async function snapshot(force = false) {
  if (!enabled()) return;
  if (saving) return saving;
  const { db, get } = require('./db');
  const changes = get('SELECT total_changes() AS n').n;
  if (!force && changes === lastChanges) return;
  saving = (async () => {
    const tmp = path.join(config.dataDir, `snapshot-${process.pid}.db`);
    try {
      fs.rmSync(tmp, { force: true });
      db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
      const data = fs.readFileSync(tmp);
      await getPool().query(
        `INSERT INTO mboalearn_snapshots (id, data, updated_at) VALUES (1, $1, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [data]);
      lastChanges = changes;
    } catch (e) {
      console.error('[persist] sauvegarde impossible :', e.message);
    } finally {
      fs.rmSync(tmp, { force: true });
      saving = null;
    }
  })();
  return saving;
}

function start() {
  if (!enabled()) return;
  snapshot(true);
  setInterval(() => snapshot(), SNAPSHOT_EVERY_MS).unref();
  // Render envoie SIGTERM avant la mise en veille ou un redéploiement
  let stopping = false;
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, async () => {
      if (stopping) return;
      stopping = true;
      console.log(`[persist] ${sig} reçu : sauvegarde finale…`);
      if (saving) await saving;
      await snapshot(true);
      await pool?.end().catch(() => {});
      process.exit(0);
    });
  }
  console.log('[persist] sauvegarde automatique vers PostgreSQL active');
}

// ---------------------------------------------------------------- Fichiers
async function saveFile(name, mime, buf) {
  if (!enabled()) return;
  await getPool().query('INSERT INTO mboalearn_files (name, mime, data) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING', [name, mime, buf]);
}

async function loadFile(name) {
  if (!enabled()) return null;
  const r = await getPool().query('SELECT mime, data FROM mboalearn_files WHERE name = $1', [name]);
  return r.rows[0] || null;
}

module.exports = { enabled, restore, snapshot, start, saveFile, loadFile };
