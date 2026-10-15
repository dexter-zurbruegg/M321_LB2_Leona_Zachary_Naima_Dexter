// Statistik-Service (Zachary): wertet die TODOs des Benutzers aus. Eigene Datenbank braucht er nicht:
// er holt die Daten jedes Mal frisch über die APIs von TODO-Service (Dexter) und Kategorien-Service (Naima).
const os = require('node:os');
const express = require('express');
const { requireAuth } = require('./auth');
const { callService } = require('./client');
const { computeStats } = require('./stats');
const { HttpError, requestContext, notFound, errorHandler, log } = require('./http');

const TODO_URL = process.env.TODO_SERVICE_URL || 'http://todo-service:3000';
const CATEGORY_URL = process.env.CATEGORY_SERVICE_URL || 'http://category-service:3000';
const INSTANCE = os.hostname();

// Kategorien sind nur "nice to have" (Namen für die Auswertung pro Kategorie).
// Fällt der Kategorien-Service aus, liefern wir die Statistik trotzdem (Regel 5.3.5), nur ohne Namen.
async function loadCategories(req) {
  try {
    const res = await callService('Der Kategorien-Service', `${CATEGORY_URL}/categories?includeDeleted=true`, {
      token: req.token,
      requestId: req.id,
    });
    return res.ok ? res.data : null;
  } catch (err) {
    log({ level: 'warn', requestId: req.id, message: `Statistik ohne Kategorienamen: ${err.message}` });
    return null;
  }
}

const app = express();
app.use(requestContext('stats-service'));

// Ohne eigene DB: "bereit" heisst, der Prozess läuft.
app.get(['/health', '/health/live'], (req, res) => res.json({ status: 'ok', service: 'stats-service', instance: INSTANCE }));

app.get('/stats', requireAuth, async (req, res) => {
  // Beide Services gleichzeitig abfragen (spart Zeit). Die TODOs sind Pflicht, die Kategorien optional.
  const [response, categories] = await Promise.all([
    callService('Der TODO-Service', `${TODO_URL}/todos`, { token: req.token, requestId: req.id }),
    loadCategories(req),
  ]);
  if (response.status === 401) throw new HttpError(401, 'UNAUTHORIZED', 'Anmeldung ungültig oder abgelaufen');
  if (!response.ok) throw new HttpError(502, 'TODO_FETCH_FAILED', 'TODO-Daten konnten nicht geladen werden');
  res.json(computeStats(response.data, categories));
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
