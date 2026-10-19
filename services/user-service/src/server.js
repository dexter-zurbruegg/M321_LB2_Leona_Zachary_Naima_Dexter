const app = require('./app');
const { migrate } = require('./db');
const { log } = require('./http');
const SCHEMA = require('./schema');

const PORT = Number(process.env.PORT || 3000);


migrate(SCHEMA).then(() => {
  const server = app.listen(PORT, () => log({ service: 'user-service', message: `läuft auf Port ${PORT}` }));
  // Sauber herunterfahren (docker stop / Kubernetes): laufende Requests fertig bearbeiten.
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
});
