// Kategorien-Service (Naima): F05, Prüf-Endpunkt für den TODO-Service, Soft-Delete, N02.
const { test } = require('node:test');
const assert = require('node:assert');
const { call, newUser } = require('./helpers');

test('TC-K01 Kategorie erstellen, lesen, auflisten', async () => {
  const u = await newUser('k01');
  const created = await call('POST', '/categories', { token: u.token, body: { name: 'Schule', color: '#FF8800' } });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.color, '#ff8800');
  assert.strictEqual(created.body.deletedAt, null);
  assert.strictEqual((await call('GET', `/categories/${created.body.id}`, { token: u.token })).body.name, 'Schule');
  assert.deepStrictEqual((await call('GET', '/categories', { token: u.token })).body.map((c) => c.name), ['Schule']);
});

test('TC-K02 Standardfarbe und Validierung (Name leer, Farbe ungültig) -> 400', async () => {
  const u = await newUser('k02');
  assert.strictEqual((await call('POST', '/categories', { token: u.token, body: { name: 'X' } })).body.color, '#2f6fed');
  assert.strictEqual((await call('POST', '/categories', { token: u.token, body: { name: '  ' } })).status, 400);
  assert.strictEqual((await call('POST', '/categories', { token: u.token, body: { name: 'Y', color: 'rot' } })).status, 400);
});

test('TC-K03 gleicher Name (auch andere Gross-/Kleinschreibung) -> 409, nach Löschen wieder erlaubt', async () => {
  const u = await newUser('k03');
  const first = await call('POST', '/categories', { token: u.token, body: { name: 'Arbeit' } });
  assert.strictEqual((await call('POST', '/categories', { token: u.token, body: { name: 'arbeit' } })).status, 409);
  await call('DELETE', `/categories/${first.body.id}`, { token: u.token });
  assert.strictEqual((await call('POST', '/categories', { token: u.token, body: { name: 'Arbeit' } })).status, 201);
});

test('TC-K04 umbenennen und Farbe ändern', async () => {
  const u = await newUser('k04');
  const c = await call('POST', '/categories', { token: u.token, body: { name: 'Alt' } });
  const res = await call('PATCH', `/categories/${c.body.id}`, { token: u.token, body: { name: 'Neu', color: '#00aa00' } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.name, 'Neu');
  assert.strictEqual(res.body.color, '#00aa00');
});

test('TC-K05 Löschen ist Soft-Delete: weg aus Liste und Prüf-Endpunkt, aber mit includeDeleted sichtbar', async () => {
  const u = await newUser('k05');
  const c = await call('POST', '/categories', { token: u.token, body: { name: 'Temp' } });
  assert.strictEqual((await call('DELETE', `/categories/${c.body.id}`, { token: u.token })).status, 204);
  assert.strictEqual((await call('GET', `/categories/${c.body.id}`, { token: u.token })).status, 404);
  assert.deepStrictEqual((await call('GET', '/categories', { token: u.token })).body, []);
  const all = (await call('GET', '/categories?includeDeleted=true', { token: u.token })).body;
  assert.strictEqual(all.length, 1);
  assert.ok(all[0].deletedAt);
  assert.strictEqual((await call('PATCH', `/categories/${c.body.id}`, { token: u.token, body: { name: 'X' } })).status, 404);
});

test('TC-K06 fremde Kategorien: lesen, ändern, löschen -> 404 (N02)', async () => {
  const owner = await newUser('k06a');
  const other = await newUser('k06b');
  const c = await call('POST', '/categories', { token: owner.token, body: { name: 'Privat' } });
  for (const [method, body] of [['GET'], ['PATCH', { name: 'Hack' }], ['DELETE']]) {
    assert.strictEqual((await call(method, `/categories/${c.body.id}`, { token: other.token, body })).status, 404);
  }
  assert.deepStrictEqual((await call('GET', '/categories', { token: other.token })).body, []);
  assert.strictEqual((await call('GET', `/categories/${c.body.id}`, { token: owner.token })).body.name, 'Privat');
});

test('TC-K07 ohne Anmeldung -> 401, ungültige ID -> 404', async () => {
  const u = await newUser('k07');
  assert.strictEqual((await call('GET', '/categories')).status, 401);
  assert.strictEqual((await call('GET', '/categories/keine-uuid', { token: u.token })).status, 404);
});
