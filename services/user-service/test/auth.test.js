// Prüft den vereinbarten JWT-Vertrag (docs/schnittstellen.md): HS256, iss = user-service, sub = gültige UUID, exp vorhanden und endlich.
process.env.JWT_SECRET = 'test-secret-nur-fuer-tests';
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../src/auth');

const UID = '3f2b8c1e-5a4d-4e7b-9c10-1a2b3c4d5e6f';

function run(header) {
  const req = { get: (h) => (h.toLowerCase() === 'authorization' ? header : undefined) };
  let error;
  requireAuth(req, {}, (err) => (error = err));
  return { req, error };
}
const sign = (claims, opts = {}) => jwt.sign(claims, process.env.JWT_SECRET, { issuer: 'user-service', ...opts });

test('gültiges Token -> req.user.id aus "sub"', () => {
  const { req, error } = run(`Bearer ${sign({ sub: UID, email: 'a@b.ch' }, { expiresIn: 60 })}`);
  assert.strictEqual(error, undefined);
  assert.strictEqual(req.user.id, UID);
});

test('fehlendes Token -> 401', () => {
  assert.strictEqual(run(undefined).error.status, 401);
});

test('falsches Secret -> 401', () => {
  const token = jwt.sign({ sub: UID }, 'anderes-secret', { issuer: 'user-service', expiresIn: 60 });
  assert.strictEqual(run(`Bearer ${token}`).error.status, 401);
});

test('abgelaufenes Token -> 401', () => {
  const token = sign({ sub: UID, exp: Math.floor(Date.now() / 1000) - 10 });
  assert.strictEqual(run(`Bearer ${token}`).error.status, 401);
});

test('Token ohne exp -> 401', () => {
  assert.strictEqual(run(`Bearer ${sign({ sub: UID })}`).error.status, 401);
});

test('exp kein Zahlenwert -> 401', () => {
  // jwt.sign lehnt so ein exp ab, deshalb Token von Hand bauen (HS256).
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, iss: 'user-service', exp: 'morgen' })}`;
  const sig = require('node:crypto').createHmac('sha256', process.env.JWT_SECRET).update(body).digest('base64url');
  assert.strictEqual(run(`Bearer ${body}.${sig}`).error.status, 401);
});

test('sub keine UUID -> 401', () => {
  assert.strictEqual(run(`Bearer ${sign({ sub: 'u-1' }, { expiresIn: 60 })}`).error.status, 401);
});

test('Token ohne sub -> 401', () => {
  assert.strictEqual(run(`Bearer ${sign({ email: 'a@b.ch' }, { expiresIn: 60 })}`).error.status, 401);
});

test('falscher Issuer -> 401', () => {
  const token = jwt.sign({ sub: UID }, process.env.JWT_SECRET, { issuer: 'fremd', expiresIn: 60 });
  assert.strictEqual(run(`Bearer ${token}`).error.status, 401);
});
