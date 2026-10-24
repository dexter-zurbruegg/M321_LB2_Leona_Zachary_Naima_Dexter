process.env.JWT_SECRET = 'category-test-secret-only';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../src/auth');
const userId = '6bd155b8-78ae-4bfb-adbc-8ca41a64c2f4';

function run(header) {
  const req = { get: () => header };
  let error;
  requireAuth(req, {}, err => { error = err; });
  return { req, error };
}

function sign(payload = {}, options = {}, secret = process.env.JWT_SECRET) {
  return jwt.sign({ sub: userId, ...payload }, secret,
    { algorithm: 'HS256', issuer: 'user-service', expiresIn: 60, ...options });
}

test('gültiges Benutzer-Token übernimmt ausschliesslich die signierte Identität', () => {
  const token = sign({ email: 'fixture@example.com' });
  const { req, error } = run(`Bearer ${token}`);
  assert.equal(error, undefined);
  assert.equal(req.user.id, userId);
  assert.equal(req.token, token);
});

for (const [name, makeToken] of [
  ['ungültige Benutzer-ID', () => sign({ sub: 'keine-uuid' })],
  ['fehlende Benutzer-ID', () => jwt.sign({}, process.env.JWT_SECRET, { issuer: 'user-service', expiresIn: 60 })],
  ['fehlende Ablaufzeit', () => jwt.sign({ sub: userId }, process.env.JWT_SECRET, { issuer: 'user-service' })],
  ['abgelaufen', () => sign({}, { expiresIn: -1 })],
  ['falscher Aussteller', () => sign({}, { issuer: 'anderer-service' })],
  ['falscher Algorithmus', () => sign({}, { algorithm: 'HS384' })],
  ['falsche Signatur', () => sign({}, {}, 'other-secret')],
  ['kein Token', () => null],
  ['beschädigtes Token', () => 'abc.def.ghi'],
]) {
  test(`${name}: 401 statt Datenbankzugriff`, () => {
    const token = makeToken();
    const { req, error } = run(token ? `Bearer ${token}` : undefined);
    assert.equal(error?.status, 401);
    assert.equal(req.user, undefined);
  });
}
