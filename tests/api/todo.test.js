// TODO-Service (Dexter): F03, F04, F06, Zusatzfeatures (Filter, Suche, Priorität), N02.
const { test } = require('node:test');
const assert = require('node:assert');
const { call, newUser } = require('./helpers');

test('TC-T01 TODO erstellen mit Standardwerten', async () => {
  const u = await newUser('t01');
  const res = await call('POST', '/todos', { token: u.token, body: { title: 'Einkaufen' } });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.status, 'open');
  assert.strictEqual(res.body.priority, 'medium');
  assert.strictEqual(res.body.categoryId, null);
  assert.strictEqual(res.body.completedAt, null);
});

test('TC-T02 Validierung: leerer Titel, falscher Status / Priorität -> 400', async () => {
  const u = await newUser('t02');
  for (const body of [{ title: '' }, { title: 'x', status: 'fertig' }, { title: 'x', priority: 'sofort' }]) {
    const res = await call('POST', '/todos', { token: u.token, body });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
  }
});

test('TC-T03 bearbeiten, anzeigen, löschen', async () => {
  const u = await newUser('t03');
  const t = (await call('POST', '/todos', { token: u.token, body: { title: 'Alt' } })).body;
  const edited = await call('PATCH', `/todos/${t.id}`, { token: u.token, body: { title: 'Neu', description: 'Details', priority: 'high' } });
  assert.strictEqual(edited.body.title, 'Neu');
  assert.strictEqual(edited.body.priority, 'high');
  assert.strictEqual((await call('GET', `/todos/${t.id}`, { token: u.token })).body.description, 'Details');
  assert.strictEqual((await call('DELETE', `/todos/${t.id}`, { token: u.token })).status, 204);
  assert.strictEqual((await call('GET', `/todos/${t.id}`, { token: u.token })).status, 404);
});

test('TC-T04 Status: erledigt setzt completedAt, wieder öffnen setzt es zurück (F04, Regel 5.3.4)', async () => {
  const u = await newUser('t04');
  const t = (await call('POST', '/todos', { token: u.token, body: { title: 'Status' } })).body;
  const progress = await call('PATCH', `/todos/${t.id}`, { token: u.token, body: { status: 'in_progress' } });
  assert.strictEqual(progress.body.completedAt, null);
  const done = await call('PATCH', `/todos/${t.id}`, { token: u.token, body: { status: 'done' } });
  assert.ok(done.body.completedAt);
  const reopened = await call('PATCH', `/todos/${t.id}`, { token: u.token, body: { status: 'open' } });
  assert.strictEqual(reopened.body.status, 'open');
  assert.strictEqual(reopened.body.completedAt, null);
});

test('TC-T05 Kategorie zuordnen und entfernen (F06)', async () => {
  const u = await newUser('t05');
  const c = (await call('POST', '/categories', { token: u.token, body: { name: 'Haushalt' } })).body;
  const t = (await call('POST', '/todos', { token: u.token, body: { title: 'Putzen', categoryId: c.id } })).body;
  assert.strictEqual(t.categoryId, c.id);
  const removed = await call('PATCH', `/todos/${t.id}`, { token: u.token, body: { categoryId: null } });
  assert.strictEqual(removed.body.categoryId, null);
});

test('TC-T06 fremde oder gelöschte Kategorie -> 422 CATEGORY_NOT_FOUND', async () => {
  const u = await newUser('t06a');
  const other = await newUser('t06b');
  const foreign = (await call('POST', '/categories', { token: other.token, body: { name: 'Fremd' } })).body;
  const r1 = await call('POST', '/todos', { token: u.token, body: { title: 'x', categoryId: foreign.id } });
  assert.strictEqual(r1.status, 422);
  assert.strictEqual(r1.body.error.code, 'CATEGORY_NOT_FOUND');
  const own = (await call('POST', '/categories', { token: u.token, body: { name: 'Eigen' } })).body;
  await call('DELETE', `/categories/${own.id}`, { token: u.token });
  assert.strictEqual((await call('POST', '/todos', { token: u.token, body: { title: 'x', categoryId: own.id } })).status, 422);
});

test('TC-T07 TODO bleibt nach dem Löschen seiner Kategorie erhalten und bearbeitbar (Regel 5.3.2)', async () => {
  const u = await newUser('t07');
  const c = (await call('POST', '/categories', { token: u.token, body: { name: 'Projekt' } })).body;
  const t = (await call('POST', '/todos', { token: u.token, body: { title: 'Bleibt', categoryId: c.id } })).body;
  await call('DELETE', `/categories/${c.id}`, { token: u.token });
  const after = await call('GET', `/todos/${t.id}`, { token: u.token });
  assert.strictEqual(after.body.categoryId, c.id);
  const edited = await call('PATCH', `/todos/${t.id}`, { token: u.token, body: { status: 'done' } });
  assert.strictEqual(edited.status, 200);
});

test('TC-T08 Filter (Status, Priorität, Kategorie), Suche und Sortierung', async () => {
  const u = await newUser('t08');
  const c = (await call('POST', '/categories', { token: u.token, body: { name: 'Filter' } })).body;
  await call('POST', '/todos', { token: u.token, body: { title: 'Mathe lernen', priority: 'low' } });
  await call('POST', '/todos', { token: u.token, body: { title: 'Mathe Prüfung', priority: 'high', categoryId: c.id } });
  await call('POST', '/todos', { token: u.token, body: { title: 'Velo flicken', status: 'done' } });
  const titles = async (q) => (await call('GET', `/todos${q}`, { token: u.token })).body.map((t) => t.title);
  assert.deepStrictEqual(await titles(''), ['Mathe Prüfung', 'Mathe lernen', 'Velo flicken']); // offen+hoch zuerst
  assert.deepStrictEqual(await titles('?status=done'), ['Velo flicken']);
  assert.deepStrictEqual(await titles('?priority=high'), ['Mathe Prüfung']);
  assert.deepStrictEqual(await titles(`?categoryId=${c.id}`), ['Mathe Prüfung']);
  assert.deepStrictEqual(await titles('?q=mathe'), ['Mathe Prüfung', 'Mathe lernen']);
  assert.deepStrictEqual(await titles('?q=%25'), []); // % wird als Zeichen gesucht, nicht als Platzhalter
});

test('TC-T09 fremde TODOs: lesen, ändern, löschen -> 404 (N02)', async () => {
  const owner = await newUser('t09a');
  const other = await newUser('t09b');
  const t = (await call('POST', '/todos', { token: owner.token, body: { title: 'Geheim' } })).body;
  for (const [method, body] of [['GET'], ['PATCH', { title: 'Hack' }], ['DELETE']]) {
    assert.strictEqual((await call(method, `/todos/${t.id}`, { token: other.token, body })).status, 404);
  }
  assert.deepStrictEqual((await call('GET', '/todos', { token: other.token })).body, []);
  assert.strictEqual((await call('GET', `/todos/${t.id}`, { token: owner.token })).body.title, 'Geheim');
});

test('TC-T10 ohne Anmeldung -> 401', async () => {
  assert.strictEqual((await call('GET', '/todos')).status, 401);
  assert.strictEqual((await call('POST', '/todos', { body: { title: 'x' } })).status, 401);
});
