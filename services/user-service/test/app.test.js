// Integrationstest des Benutzer-Service gegen eine ECHTE PostgreSQL-Datenbank.
// Die anderen Services werden durch kleine Fake-Server ersetzt. Ohne TEST_DATABASE_URL werden die Tests übersprungen.
//   TEST_DATABASE_URL=postgres://app:pw@localhost:5432/users_test npm test
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const DB_URL = process.env.TEST_DATABASE_URL;
const skip = DB_URL ? false : 'TEST_DATABASE_URL nicht gesetzt (siehe README)';

const remote = { todos: { status: 204, calls: [] }, categories: { status: 204, calls: [] } };
let fakeServers = [];
let base;
let pool;
let server;

function startFake(name) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      remote[name].calls.push({ method: req.method, auth: req.headers.authorization });
      if (remote[name].status === 'hang') return; // antwortet nie -> Timeout
      res.statusCode = remote[name].status;
      res.setHeader('content-type', 'application/json');
      res.end(remote[name].status === 204 ? '' : JSON.stringify({ error: { code: 'X', message: 'x' } }));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB_URL;
  process.env.JWT_SECRET = 'test-secret-nur-fuer-tests';
  process.env.SERVICE_TIMEOUT_MS = '500';
  fakeServers = [await startFake('todos'), await startFake('categories')];
  process.env.TODO_SERVICE_URL = `http://127.0.0.1:${fakeServers[0].address().port}`;
  process.env.CATEGORY_SERVICE_URL = `http://127.0.0.1:${fakeServers[1].address().port}`;
  const app = require('../src/app');
  ({ pool } = require('../src/db'));
  await pool.query('DROP TABLE IF EXISTS users');
  await require('../src/db').migrate(require('../src/schema'));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  server.close();
  fakeServers.forEach((s) => s.close());
  await pool.end();
});

beforeEach(async () => {
  if (skip) return;
  await pool.query('DELETE FROM users');
  for (const r of Object.values(remote)) Object.assign(r, { status: 204, calls: [] });
});

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body && { 'content-type': 'application/json' }), ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

async function newUser(name = 'lea') {
  const email = `${name}@example.com`;
  const password = 'geheim1234';
  const reg = await call('POST', '/users', { body: { email, password, displayName: name } });
  const login = await call('POST', '/auth/login', { body: { email, password } });
  return { email, password, id: reg.body.id, token: login.body.token };
}

test('Registrieren: 201, E-Mail klein geschrieben, kein Hash in der Antwort, bcrypt in der DB', { skip }, async () => {
  const res = await call('POST', '/users', { body: { email: 'Lea@Example.COM', password: 'geheim1234', displayName: ' Lea ' } });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.email, 'lea@example.com');
  assert.strictEqual(res.body.displayName, 'Lea');
  assert.doesNotMatch(JSON.stringify(res.body), /password|hash/i);
  const { rows } = await pool.query('SELECT password_hash FROM users');
  assert.match(rows[0].password_hash, /^\$2[aby]\$10\$/); // N03
});

test('Registrieren: doppelte E-Mail (auch anders geschrieben) -> 409', { skip }, async () => {
  await newUser('lea');
  const res = await call('POST', '/users', { body: { email: 'LEA@example.com', password: 'geheim1234', displayName: 'X' } });
  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.error.code, 'EMAIL_TAKEN');
});

test('Registrieren: ungültige Eingaben -> 400, Passwort über 72 Bytes -> 400', { skip }, async () => {
  const bad = await call('POST', '/users', { body: { email: 'kaputt', password: 'x', displayName: '' } });
  assert.strictEqual(bad.status, 400);
  const long = await call('POST', '/users', { body: { email: 'a@b.ch', password: 'a'.repeat(73), displayName: 'A' } });
  assert.strictEqual(long.status, 400);
  assert.match(long.body.error.message, /72/);
});

test('Login: JWT-Format gemäss Vertrag (HS256, sub, email, iss, exp = expiresAt)', { skip }, async () => {
  const u = await newUser();
  const res = await call('POST', '/auth/login', { body: { email: 'LEA@example.com', password: u.password } });
  assert.strictEqual(res.status, 200);
  const [h, p] = res.body.token.split('.').slice(0, 2).map((x) => JSON.parse(Buffer.from(x, 'base64url')));
  assert.deepStrictEqual([h.alg, p.sub, p.email, p.iss], ['HS256', u.id, u.email, 'user-service']);
  assert.strictEqual(new Date(res.body.expiresAt).getTime(), p.exp * 1000);
  assert.strictEqual(res.body.user.id, u.id);
});

test('Login: falsches Passwort und unbekannte E-Mail geben dieselbe 401-Antwort', { skip }, async () => {
  const u = await newUser();
  const a = await call('POST', '/auth/login', { body: { email: u.email, password: 'falschfalsch' } });
  const b = await call('POST', '/auth/login', { body: { email: 'gibts@nicht.ch', password: 'falschfalsch' } });
  assert.strictEqual(a.status, 401);
  assert.deepStrictEqual(a.body, b.body);
  assert.strictEqual(a.body.error.code, 'INVALID_CREDENTIALS');
});

test('Geschützte Endpunkte: ohne, manipuliertes und fremdes Token -> 401', { skip }, async () => {
  const u = await newUser();
  assert.strictEqual((await call('GET', '/users/me')).status, 401);
  assert.strictEqual((await call('GET', '/users/me', { token: u.token.slice(0, -3) + 'abc' })).status, 401);
  const jwt = require('jsonwebtoken');
  const fremd = jwt.sign({ sub: u.id }, 'anderes-secret', { issuer: 'user-service' });
  assert.strictEqual((await call('GET', '/users/me', { token: fremd })).status, 401);
  assert.strictEqual((await call('GET', '/users/me', { token: u.token })).status, 200);
});

test('Profil: Name ohne Passwort ändern, E-Mail/Passwort nur mit aktuellem Passwort', { skip }, async () => {
  const u = await newUser();
  assert.strictEqual((await call('PATCH', '/users/me', { token: u.token, body: { displayName: 'Neu' } })).body.displayName, 'Neu');
  const denied = await call('PATCH', '/users/me', { token: u.token, body: { email: 'neu@example.com' } });
  assert.strictEqual(denied.status, 403);
  assert.strictEqual(denied.body.error.code, 'WRONG_PASSWORD');
  const ok = await call('PATCH', '/users/me', { token: u.token, body: { email: 'Neu@Example.com', currentPassword: u.password } });
  assert.strictEqual(ok.body.email, 'neu@example.com');
});

test('Profil: Passwort ändern, danach gilt nur das neue; fremde E-Mail -> 409', { skip }, async () => {
  const u = await newUser('lea');
  const other = await newUser('dexter');
  const taken = await call('PATCH', '/users/me', { token: u.token, body: { email: other.email, currentPassword: u.password } });
  assert.strictEqual(taken.status, 409);
  await call('PATCH', '/users/me', { token: u.token, body: { currentPassword: u.password, password: 'neuesPasswort1' } });
  assert.strictEqual((await call('POST', '/auth/login', { body: { email: u.email, password: u.password } })).status, 401);
  assert.strictEqual((await call('POST', '/auth/login', { body: { email: u.email, password: 'neuesPasswort1' } })).status, 200);
});

test('Abmelden -> 204, Gesundheitscheck mit Datenbank', { skip }, async () => {
  const u = await newUser();
  assert.strictEqual((await call('POST', '/auth/logout', { token: u.token })).status, 204);
  const h = await call('GET', '/health');
  assert.deepStrictEqual([h.status, h.body.status, h.body.db], [200, 'ok', 'ok']);
  assert.ok(h.headers.get('x-instance') && h.headers.get('x-request-id'));
});

test('Konto löschen: ruft DELETE /todos und /categories mit dem Token des Benutzers auf, dann Konto weg', { skip }, async () => {
  const u = await newUser();
  assert.strictEqual((await call('DELETE', '/users/me', { token: u.token })).status, 204);
  assert.deepStrictEqual(remote.todos.calls, [{ method: 'DELETE', auth: `Bearer ${u.token}` }]);
  assert.deepStrictEqual(remote.categories.calls, [{ method: 'DELETE', auth: `Bearer ${u.token}` }]);
  assert.strictEqual((await call('GET', '/users/me', { token: u.token })).status, 404);
  assert.strictEqual((await call('POST', '/auth/login', { body: { email: u.email, password: u.password } })).status, 401);
});

test('Konto löschen: TODO-Service lehnt ab (z. B. 401 wegen anderem JWT_SECRET) -> 503, Konto bleibt', { skip }, async () => {
  const u = await newUser();
  remote.todos.status = 401;
  const res = await call('DELETE', '/users/me', { token: u.token });
  assert.strictEqual(res.status, 503);
  assert.strictEqual(res.body.error.code, 'DEPENDENCY_UNAVAILABLE');
  assert.strictEqual((await call('GET', '/users/me', { token: u.token })).status, 200);
});

test('Konto löschen: TODO-Service antwortet nicht (Timeout) -> 503, Konto bleibt', { skip }, async () => {
  const u = await newUser();
  remote.todos.status = 'hang';
  const res = await call('DELETE', '/users/me', { token: u.token });
  assert.strictEqual(res.status, 503);
  assert.strictEqual((await call('GET', '/users/me', { token: u.token })).status, 200);
  assert.strictEqual(remote.categories.calls.length, 0); // Reihenfolge: erst TODOs, dann Kategorien
});

test('Konto löschen: Kategorien-Service meldet 500 -> 503, Konto bleibt', { skip }, async () => {
  const u = await newUser();
  remote.categories.status = 500;
  assert.strictEqual((await call('DELETE', '/users/me', { token: u.token })).status, 503);
  assert.strictEqual((await call('GET', '/users/me', { token: u.token })).status, 200);
});

test('Fehlerformat: unbekannte Route 404, kaputtes JSON 400', { skip }, async () => {
  assert.strictEqual((await call('GET', '/gibt-es-nicht')).body.error.code, 'NOT_FOUND');
  const res = await fetch(`${base}/users`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{kaputt' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).error.code, 'INVALID_JSON');
});
