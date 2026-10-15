const app = require('./app');
const { log } = require('./http');

const PORT = Number(process.env.PORT || 3000);
const server = app.listen(PORT, () => log({ service: 'stats-service', message: `läuft auf Port ${PORT}` }));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
