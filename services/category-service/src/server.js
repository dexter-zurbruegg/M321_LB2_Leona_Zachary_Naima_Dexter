const app = require('./app');
const { migrate } = require('./db');
const { log } = require('./http');

const PORT = Number(process.env.PORT || 3000);

// Der eindeutige Index gilt nur für aktive Kategorien: nach dem Löschen darf derselbe Name wieder verwendet werden.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#2f6fed',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_unique_active_name
  ON categories (user_id, lower(name)) WHERE deleted_at IS NULL;`;

migrate(SCHEMA).then(() => {
  const server = app.listen(PORT, () => log({ service: 'category-service', message: `läuft auf Port ${PORT}` }));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
});
