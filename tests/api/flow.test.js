// F09: der ganze Ablauf über alle vier Services, so wie im Frontend (Registrieren bis Statistik).
const { test } = require('node:test');
const assert = require('node:assert');
const { call } = require('./helpers');

test('TC-E01 Registrieren -> Login -> Kategorie -> TODO -> erledigen -> Statistik -> Abmelden', async () => {
  const email = `flow-${Date.now()}@example.com`;
  assert.strictEqual((await call('POST', '/users', { body: { email, password: 'geheim1234', displayName: 'Flow' } })).status, 201);
  const { token } = (await call('POST', '/auth/login', { body: { email, password: 'geheim1234' } })).body;
  const category = (await call('POST', '/categories', { token, body: { name: 'Schule' } })).body;
  const todo = (await call('POST', '/todos', { token, body: { title: 'M321 Doku', categoryId: category.id } })).body;
  await call('PATCH', `/todos/${todo.id}`, { token, body: { status: 'done' } });
  const stats = (await call('GET', '/stats', { token })).body;
  assert.strictEqual(stats.done, 1);
  assert.strictEqual(stats.byCategory[0].name, 'Schule');
  assert.notStrictEqual(stats.averageCompletionSeconds, null);
  assert.strictEqual((await call('POST', '/auth/logout', { token })).status, 204);
});

test('TC-E02 Frontend wird ausgeliefert, unbekannte API-Route -> JSON 404', async () => {
  const { BASE_URL } = require('./helpers');
  const html = await (await fetch(`${BASE_URL}/`)).text();
  assert.match(html, /TODO-App/);
  const res = await call('GET', '/gibtsnicht');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error.code, 'NOT_FOUND');
});

test('TC-E03 Korrelations-ID: jede Antwort hat X-Request-Id und X-Instance', async () => {
  const res = await call('GET', '/health/todo');
  assert.match(res.headers.get('x-request-id'), /^[0-9a-f]{32}$/);
  assert.ok(res.headers.get('x-instance'));
});
