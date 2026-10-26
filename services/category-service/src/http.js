// Gemeinsame HTTP-Helfer: einheitliche Fehler, Request-ID (Korrelations-ID) und JSON-Logs.
// Jeder Service hat eine eigene Kopie dieser Datei, damit er unabhängig gebaut und gestartet werden kann.
const os = require('node:os');
const crypto = require('node:crypto');

const INSTANCE = os.hostname();

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function requestContext(service) {
  return (req, res, next) => {
    req.id = req.get('x-request-id') || crypto.randomUUID();
    res.set('X-Request-Id', req.id);
    res.set('X-Instance', INSTANCE);
    const start = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/health')) return; // Healthchecks nicht loggen (sonst alle 10 s eine Zeile)
      log({ service, requestId: req.id, method: req.method, path: req.originalUrl, status: res.statusCode, ms: Date.now() - start });
    });
    next();
  };
}

function log(fields) {
  console.log(JSON.stringify({ time: new Date().toISOString(), instance: INSTANCE, ...fields }));
}

function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route nicht gefunden' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Ungültiges JSON im Request' } });
  }
  log({ level: 'error', requestId: req.id, message: err.message });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Interner Fehler, bitte später erneut versuchen' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

module.exports = { HttpError, requestContext, notFound, errorHandler, log, isUuid, INSTANCE };
