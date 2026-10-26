// Benutzer-Service (Leona): F01, F02, N02, N03. Test-IDs siehe docs/testprotokoll.md
const { test } = require('node:test');
const assert = require('node:assert');
const { call, newUser } = require('./helpers');

test('TC-U01 Registrieren liefert 201 ohne Passwort-Hash in der Antwort', async () => {
  const email = `u01-${Date.now()}@example.com`;
  const res = await call('POST', '/users', { body: { email, password: 'geheim1234', displayName: 'Lea' } });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.email, email);
  assert.ok(!('password' in res.body) && !('passwordHash' in res.body));
});

test('TC-U02 doppelte E-Mail -> 409 EMAIL_TAKEN', async () => {
  const u = await newUser('u02');
  const res = await call('POST', '/users', { body: { email: u.email, password: 'geheim1234', displayName: 'X' } });
  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.error.code, 'EMAIL_TAKEN');
});

test('TC-U03 ungültige Eingaben -> 400 mit verständlicher Meldung', async () => {
  const res = await call('POST', '/users', { body: { email: 'kein-mail', password: 'kurz', displayName: '' } });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
  assert.match(res.body.error.message, /E-Mail/);
});

test('TC-U04 Login liefert ein JWT im vereinbarten Format (HS256, sub = userId)', async () => {
  const u = await newUser('u04');
  const res = await call('POST', '/auth/login', { body: { email: u.email, password: u.password } });
  assert.strictEqual(res.status, 200);
  const [header, payload] = res.body.token.split('.').slice(0, 2).map((p) => JSON.parse(Buffer.from(p, 'base64url').toString()));
  assert.strictEqual(header.alg, 'HS256');
  assert.strictEqual(payload.sub, u.id);
  assert.strictEqual(payload.iss, 'user-service');
  assert.ok(payload.exp > payload.iat);
});

test('TC-U05 falsches Passwort -> 401 INVALID_CREDENTIALS', async () => {
  const u = await newUser('u05');
  const res = await call('POST', '/auth/login', { body: { email: u.email, password: 'falschfalsch' } });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error.code, 'INVALID_CREDENTIALS');
});

test('TC-U06 geschützte Endpunkte ohne / mit manipuliertem Token -> 401', async () => {
  const u = await newUser('u06');
  assert.strictEqual((await call('GET', '/users/me')).status, 401);
  const forged = u.token.slice(0, -3) + (u.token.endsWith('aaa') ? 'bbb' : 'aaa');
  assert.strictEqual((await call('GET', '/users/me', { token: forged })).status, 401);
});

test('TC-U07 Profil ändern (Anzeigename) ohne Passwort, E-Mail nur mit Passwort', async () => {
  const u = await newUser('u07');
  const ok = await call('PATCH', '/users/me', { token: u.token, body: { displayName: 'Neu' } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.displayName, 'Neu');
  const denied = await call('PATCH', '/users/me', { token: u.token, body: { email: `neu-${Date.now()}@example.com` } });
  assert.strictEqual(denied.status, 403);
});

test('TC-U08 Passwort ändern -> altes Passwort funktioniert nicht mehr', async () => {
  const u = await newUser('u08');
  const res = await call('PATCH', '/users/me', { token: u.token, body: { currentPassword: u.password, password: 'neuesPasswort1' } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await call('POST', '/auth/login', { body: { email: u.email, password: u.password } })).status, 401);
  assert.strictEqual((await call('POST', '/auth/login', { body: { email: u.email, password: 'neuesPasswort1' } })).status, 200);
});

test('TC-U09 Abmelden -> 204', async () => {
  const u = await newUser('u09');
  assert.strictEqual((await call('POST', '/auth/logout', { token: u.token })).status, 204);
});

test('TC-U10 Konto löschen entfernt auch TODOs und Kategorien (Regel 5.3.3)', async () => {
  const u = await newUser('u10');
  await call('POST', '/categories', { token: u.token, body: { name: 'Weg' } });
  await call('POST', '/todos', { token: u.token, body: { title: 'Weg' } });
  assert.strictEqual((await call('DELETE', '/users/me', { token: u.token })).status, 204);
  // Token ist noch gültig (zustandslos), aber es gibt keine Daten mehr und kein Login
  assert.deepStrictEqual((await call('GET', '/todos', { token: u.token })).body, []);
  assert.deepStrictEqual((await call('GET', '/categories?includeDeleted=true', { token: u.token })).body, []);
  assert.strictEqual((await call('GET', '/users/me', { token: u.token })).status, 404);
  assert.strictEqual((await call('POST', '/auth/login', { body: { email: u.email, password: u.password } })).status, 401);
});
