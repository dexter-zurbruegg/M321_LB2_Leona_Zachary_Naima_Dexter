// Gemeinsamer API-Client: alle Aufrufe gehen über den Reverse Proxy (/api/...), nie direkt an die Services.
// Hängt das JWT an, übersetzt Fehler in verständliche Meldungen (F10) und meldet bei 401 ab (F02).
const TOKEN_KEY = 'todo-app-token';

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
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Server nicht erreichbar. Bitte Verbindung prüfen und erneut versuchen.');
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
