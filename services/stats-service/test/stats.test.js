const test = require('node:test');
const assert = require('node:assert');
const { computeStats, averageCompletionSeconds, countByStatus, byCategory } = require('../src/stats');

const H = 3600;
const todo = (status, createdAt, completedAt, categoryId = null) => ({ status, createdAt, completedAt, categoryId });

test('zählt offene, laufende und erledigte TODOs (F07)', () => {
  const todos = [
    todo('open', '2026-10-01T10:00:00Z'),
    todo('open', '2026-10-01T10:00:00Z'),
    todo('in_progress', '2026-10-01T10:00:00Z'),
    todo('done', '2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z'),
  ];
  assert.deepStrictEqual(countByStatus(todos), { open: 2, inProgress: 1, done: 1, total: 4 });
});

test('Durchschnitt aus bekannten Zeitwerten (F08): 1 h und 3 h -> 2 h', () => {
  const todos = [
    todo('done', '2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z'),
    todo('done', '2026-10-01T10:00:00Z', '2026-10-01T13:00:00Z'),
  ];
  assert.strictEqual(averageCompletionSeconds(todos), 2 * H);
});

test('ohne erledigte TODOs -> null ("Keine Daten")', () => {
  assert.strictEqual(averageCompletionSeconds([]), null);
  assert.strictEqual(averageCompletionSeconds([todo('open', '2026-10-01T10:00:00Z')]), null);
});

test('wieder geöffnete TODOs zählen nicht für die Dauer (Regel 5.3.4)', () => {
  // completedAt wurde beim Wiedereröffnen zurückgesetzt -> status open, completedAt null
  const todos = [todo('open', '2026-10-01T10:00:00Z', null), todo('done', '2026-10-01T10:00:00Z', '2026-10-01T10:30:00Z')];
  assert.strictEqual(averageCompletionSeconds(todos), 1800);
});

test('pro Kategorie, mit Namen und "Ohne Kategorie"', () => {
  const cats = [{ id: 'c1', name: 'Schule', color: '#ff0000', deletedAt: null }];
  const result = byCategory(
    [todo('open', '2026-10-01T10:00:00Z', null, 'c1'), todo('done', '2026-10-01T10:00:00Z', '2026-10-01T12:00:00Z', 'c1'), todo('open', '2026-10-01T10:00:00Z')],
    cats,
  );
  assert.strictEqual(result[0].name, 'Schule');
  assert.strictEqual(result[0].total, 2);
  assert.strictEqual(result[0].averageCompletionSeconds, 2 * H);
  assert.strictEqual(result[1].name, 'Ohne Kategorie');
});

test('Kategorien-Service ausgefallen -> Zahlen trotzdem, Name null', () => {
  const s = computeStats([todo('open', '2026-10-01T10:00:00Z', null, 'c1')], null);
  assert.strictEqual(s.categoriesAvailable, false);
  assert.strictEqual(s.byCategory[0].name, null);
  assert.strictEqual(s.byCategory[0].open, 1);
});

test('erledigt in den letzten 7 Tagen', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const s = computeStats(
    [todo('done', '2026-10-01T10:00:00Z', '2026-10-19T10:00:00Z'), todo('done', '2026-10-01T10:00:00Z', '2026-10-05T10:00:00Z')],
    [],
    now,
  );
  assert.strictEqual(s.completedLast7Days, 1);
});

test('letzte sieben Tage schliessen zukuenftige Werte aus und die Grenze ein', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const result = computeStats([
    todo('done', '2026-10-01T00:00:00Z', '2026-10-13T12:00:00Z'),
    todo('done', '2026-10-01T00:00:00Z', '2026-10-13T11:59:59Z'),
    todo('done', '2026-10-01T00:00:00Z', '2026-10-20T12:00:01Z'),
  ], [], now);
  assert.strictEqual(result.completedLast7Days, 1);
});

test('ungueltige und negative Erledigungsdauern verfaelschen den Durchschnitt nicht', () => {
  assert.strictEqual(averageCompletionSeconds([
    todo('done', 'ungueltig', '2026-10-20T12:00:00Z'),
    todo('done', '2026-10-20T13:00:00Z', '2026-10-20T12:00:00Z'),
    todo('done', '2026-10-20T11:00:00Z', '2026-10-20T12:00:00Z'),
  ]), 3600);
});
