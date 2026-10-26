// Hilfsfunktionen für die API-Tests. Die Tests laufen gegen das laufende Gesamtsystem (über den Reverse Proxy).
//   BASE_URL=http://<vm-ip>:8080 node --test tests/api/
const crypto = require('node:crypto');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'content-type': 'application/json' }),
      ...(token && { authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}

// Neuen Testbenutzer anlegen und anmelden. Jede Testdatei arbeitet mit eigenen, zufälligen Benutzern.
async function newUser(prefix = 'test') {
  const email = `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = 'geheim1234';
  const created = await call('POST', '/users', { body: { email, password, displayName: prefix } });
  if (created.status !== 201) throw new Error(`Registrierung fehlgeschlagen: ${created.status} ${JSON.stringify(created.body)}`);
  const login = await call('POST', '/auth/login', { body: { email, password } });
  return { email, password, id: created.body.id, token: login.body.token };
}

module.exports = { BASE_URL, call, newUser };
