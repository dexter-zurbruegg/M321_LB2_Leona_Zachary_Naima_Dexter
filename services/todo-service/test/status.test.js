const test = require('node:test');
const assert = require('node:assert');
const { completedAtFor } = require('../src/status');

const now = new Date('2026-10-20T12:00:00Z');
const earlier = new Date('2026-10-19T08:00:00Z');

test('erledigen setzt completedAt', () => {
  assert.deepStrictEqual(completedAtFor('open', 'done', null, now), now);
  assert.deepStrictEqual(completedAtFor('in_progress', 'done', null, now), now);
});

test('erneut öffnen setzt completedAt zurück', () => {
  assert.strictEqual(completedAtFor('done', 'open', earlier, now), null);
  assert.strictEqual(completedAtFor('done', 'in_progress', earlier, now), null);
});

test('bereits erledigt bleibt beim alten Zeitpunkt', () => {
  assert.deepStrictEqual(completedAtFor('done', 'done', earlier, now), earlier);
});
