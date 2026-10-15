// PostgreSQL-Verbindung. Beide Instanzen eines Services nutzen dieselbe Datenbank (HA: gemeinsamer Datenstand).
const { Pool } = require('pg');
const { log } = require('./http');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 3000,
});
pool.on('error', (err) => log({ level: 'error', message: `DB-Pool: ${err.message}` }));

// Tabellen anlegen. Der Advisory-Lock verhindert, dass zwei gleichzeitig startende Instanzen kollidieren.
async function migrate(sql) {
  for (;;) {
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT pg_advisory_lock(321)');
        await client.query(sql);
      } finally {
        await client.query('SELECT pg_advisory_unlock(321)').catch(() => {});
        client.release();
      }
      return;
    } catch (err) {
      log({ level: 'warn', message: `DB noch nicht bereit (${err.message}), neuer Versuch in 2 s` });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

module.exports = { pool, migrate };
