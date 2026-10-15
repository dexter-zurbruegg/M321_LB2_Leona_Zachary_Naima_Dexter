const app = require('./app');
const { migrate } = require('./db');
const { log } = require('./http');

const PORT = Number(process.env.PORT || 3000);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);`;

migrate(SCHEMA).then(() => {
  const server = app.listen(PORT, () => log({ service: 'user-service', message: `läuft auf Port ${PORT}` }));
  // Sauber herunterfahren (docker stop / Kubernetes): laufende Requests fertig bearbeiten.
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
});
