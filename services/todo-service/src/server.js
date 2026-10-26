const app = require('./app');
const { migrate } = require('./db');
const { log } = require('./http');

const PORT = Number(process.env.PORT || 3000);

// category_id ist bewusst KEIN Fremdschlüssel: die Kategorien liegen in einer anderen Datenbank (Naimas Service).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS todos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
  priority     text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  category_id  uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS todos_user_idx ON todos (user_id);`;

migrate(SCHEMA).then(() => {
  const server = app.listen(PORT, () => log({ service: 'todo-service', message: `läuft auf Port ${PORT}` }));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
});
