// Gemeinsamer API-Client: alle Aufrufe gehen über den Reverse Proxy (/api/...), nie direkt an die Services.
// Hängt das JWT an, übersetzt Fehler in verständliche Meldungen (F10) und meldet bei 401 ab (F02).
const TOKEN_KEY = 'todo-app-token';
const origins = [...new Set([location.origin, ...(window.TODO_API_ORIGINS || [])])];
let activeOrigin = location.origin;

async function reachableOrigin() {
  if (origins.length === 1) return activeOrigin;
  for (const origin of [activeOrigin, ...origins.filter(x => x !== activeOrigin)]) {
    try {
      const health = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1500), cache: 'no-store' });
      if (health.ok) { activeOrigin = origin; return origin; }
    } catch { /* nächste VM prüfen */ }
  }
  throw new Error('Kein Gateway erreichbar');
}

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set token(value) { value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY); },
};

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (session.token) headers.authorization = `Bearer ${session.token}`;
  let res;
  try {
    const origin = await reachableOrigin();
    res = await fetch(`${origin}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Schreibzugriffe nicht blind wiederholen: Die erste Anfrage könnte schon gespeichert worden sein.
    throw new ApiError(0, 'NETWORK', 'Verbindung unterbrochen. Bitte neu laden und den gespeicherten Stand prüfen; danach erneut versuchen.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && session.token) {
      // Token abgelaufen oder ungültig -> abmelden und zur Anmeldung
      session.token = null;
      location.hash = '#/login';
    }
    throw new ApiError(res.status, data?.error?.code ?? `HTTP_${res.status}`, data?.error?.message ?? `Unerwarteter Fehler (${res.status})`);
  }
  return data;
}
