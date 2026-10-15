// Statistik-Service (Zachary): F07, F08 über die echte API (die Rechenlogik testen die Unit-Tests im Service).
const { test } = require('node:test');
const assert = require('node:assert');
const { call, newUser } = require('./helpers');

test('TC-S01 neuer Benutzer: alles 0, Durchschnitt null ("Keine Daten")', async () => {
  const u = await newUser('s01');
  const res = await call('GET', '/stats', { token: u.token });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(
    { open: res.body.open, inProgress: res.body.inProgress, done: res.body.done, total: res.body.total },
    { open: 0, inProgress: 0, done: 0, total: 0 },
  );
  assert.strictEqual(res.body.averageCompletionSeconds, null);
});

test('TC-S02 Zahlen stimmen mit Testdaten überein (F07)', async () => {
  const u = await newUser('s02');
  for (const status of ['open', 'open', 'in_progress', 'done']) {
    await call('POST', '/todos', { token: u.token, body: { title: status, status } });
  }
  const s = (await call('GET', '/stats', { token: u.token })).body;
  assert.deepStrictEqual([s.open, s.inProgress, s.done, s.total], [2, 1, 1, 4]);
  assert.strictEqual(s.completedLast7Days, 1);
  assert.ok(s.averageCompletionSeconds >= 0);
});

test('TC-S03 Durchschnitt misst Erstellung bis Erledigung (F08)', async () => {
  const u = await newUser('s03');
  const t = (await call('POST', '/todos', { token: u.token, body: { title: 'warten' } })).body;
  await new Promise((r) => setTimeout(r, 2100));
  await call('PATCH', `/todos/${t.id}`, { token: u.token, body: { status: 'done' } });
  const s = (await call('GET', '/stats', { token: u.token })).body;
  assert.ok(s.averageCompletionSeconds >= 2 && s.averageCompletionSeconds <= 4, `war ${s.averageCompletionSeconds}`);
});

test('TC-S04 Auswertung pro Kategorie mit Namen', async () => {
  const u = await newUser('s04');
  const c = (await call('POST', '/categories', { token: u.token, body: { name: 'Sport', color: '#00aa00' } })).body;
  await call('POST', '/todos', { token: u.token, body: { title: 'Joggen', categoryId: c.id, status: 'done' } });
  await call('POST', '/todos', { token: u.token, body: { title: 'Ohne' } });
  const s = (await call('GET', '/stats', { token: u.token })).body;
  assert.strictEqual(s.categoriesAvailable, true);
  const sport = s.byCategory.find((r) => r.categoryId === c.id);
  assert.strictEqual(sport.name, 'Sport');
  assert.strictEqual(sport.done, 1);
  assert.ok(s.byCategory.find((r) => r.categoryId === null && r.name === 'Ohne Kategorie'));
});

test('TC-S05 nur eigene Daten (N02) und ohne Anmeldung 401', async () => {
  const a = await newUser('s05a');
  const b = await newUser('s05b');
  await call('POST', '/todos', { token: a.token, body: { title: 'nur A' } });
  assert.strictEqual((await call('GET', '/stats', { token: b.token })).body.total, 0);
  assert.strictEqual((await call('GET', '/stats')).status, 401);
});
