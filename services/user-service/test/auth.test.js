// Prüft das vereinbarte JWT-Format (docs/schnittstellen.md): HS256, iss = user-service, sub = userId.
process.env.JWT_SECRET = 'test-secret-nur-fuer-tests';
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../src/auth');

function run(header) {
  const req = { get: (h) => (h.toLowerCase() === 'authorization' ? header : undefined) };
  let error;
  requireAuth(req, {}, (err) => (error = err));
  return { req, error };
}

test('gültiges Token -> req.user.id aus "sub"', () => {
  const token = jwt.sign({ sub: 'u-1', email: 'a@b.ch' }, process.env.JWT_SECRET, { issuer: 'user-service', expiresIn: 60 });
  const { req, error } = run(`Bearer ${token}`);
  assert.strictEqual(error, undefined);
  assert.strictEqual(req.user.id, 'u-1');
});

test('fehlendes Token -> 401', () => {
  assert.strictEqual(run(undefined).error.status, 401);
});

test('falsches Secret -> 401', () => {
  const token = jwt.sign({ sub: 'u-1' }, 'anderes-secret', { issuer: 'user-service' });
  assert.strictEqual(run(`Bearer ${token}`).error.status, 401);
});

test('abgelaufenes Token -> 401', () => {
  const token = jwt.sign({ sub: 'u-1', exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_SECRET, { issuer: 'user-service' });
  assert.strictEqual(run(`Bearer ${token}`).error.status, 401);
});
