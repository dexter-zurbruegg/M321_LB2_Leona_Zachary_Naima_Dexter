// Aufruf eines anderen Services mit Timeout und einem zweiten Versuch bei Verbindungsfehlern.
// Ist der andere Service nicht erreichbar (oder antwortet mit 5xx), gibt es eine verständliche 503-Antwort.
// Rückgabe: { status, ok, data } - die Antwort wird noch innerhalb des Timeouts vollständig gelesen.
const { HttpError, log } = require('./http');

const TIMEOUT_MS = Number(process.env.SERVICE_TIMEOUT_MS || 2000);

async function callService(name, url, { method = 'GET', token, requestId } = {}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: { authorization: `Bearer ${token}`, 'x-request-id': requestId },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();
      if (res.status < 500) return { status: res.status, ok: res.ok, data: text ? JSON.parse(text) : null };
      log({ level: 'warn', requestId, message: `${name} antwortet mit ${res.status}` });
    } catch (err) {
      log({ level: 'warn', requestId, message: `${name} nicht erreichbar (Versuch ${attempt}): ${err.message}` });
      if (err.name === 'TimeoutError') break; // nach Timeout nicht nochmals warten
    }
  }
  throw new HttpError(503, 'DEPENDENCY_UNAVAILABLE', `${name} ist gerade nicht erreichbar, bitte später erneut versuchen`);
}

module.exports = { callService };
