const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

// Echte HTTP-Verbindungen, aber keine fremden VMs oder Datenbanken erforderlich.
test('Statistik-HTTP-Vertrag mit getrennten Upstreams und Ausfaellen', async (t) => {
  process.env.JWT_SECRET = 'local-integration-test-secret-only';
  process.env.SERVICE_TIMEOUT_MS = '100';
  let mode = 'ok';
  const seen = [];
  async function listen(handler) {
    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
    return `http://127.0.0.1:${server.address().port}`;
  }
  process.env.TODO_SERVICE_URL = await listen((req, res) => {
    seen.push({ path: req.url, token: req.headers.authorization, id: req.headers['x-request-id'] });
    if (mode === 'timeout') return;
    res.setHeader('content-type', 'application/json');
    if (mode === 'todo-down') { res.writeHead(503); return res.end('{}'); }
    if (mode === 'invalid') return res.end('{}');
    res.end(JSON.stringify([{ status: 'done', categoryId: 'c1', createdAt: '2026-10-19T10:00:00Z', completedAt: '2026-10-19T11:00:00Z' }]));
  });
  process.env.CATEGORY_SERVICE_URL = (await listen((req, res) => {
    if (mode === 'category-down') { res.writeHead(503); return res.end('{}'); }
    res.end(JSON.stringify([{ id: 'c1', name: 'Schule', color: '#112233', deletedAt: null }]));
  })) + '/';
  const app = require('../src/app');
  const base = await listen(app);
  const token = jwt.sign({}, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: 'user-service', subject: '12345678-1234-4123-8123-123456789012', expiresIn: '1h' });
  const headers = { authorization: `Bearer ${token}`, 'x-request-id': 'integration-123' };
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/stats`)).status, 401);
  const bad = jwt.sign({}, process.env.JWT_SECRET, { issuer: 'user-service', expiresIn: '1h' });
  assert.equal((await fetch(`${base}/stats`, { headers: { authorization: `Bearer ${bad}` } })).status, 401);
  const response = await fetch(`${base}/stats`, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'integration-123');
  assert.ok(response.headers.get('x-instance'));
  const stats = await response.json();
  assert.equal(stats.averageCompletionSeconds, 3600);
  assert.equal(stats.byCategory[0].name, 'Schule');
  assert.deepEqual(seen[0], { path: '/todos', token: `Bearer ${token}`, id: 'integration-123' });
  mode = 'category-down';
  const degraded = await fetch(`${base}/stats`, { headers });
  assert.equal(degraded.status, 200);
  assert.equal((await degraded.json()).categoriesAvailable, false);
  for (const failure of ['todo-down', 'invalid', 'timeout']) {
    mode = failure;
    const failed = await fetch(`${base}/stats`, { headers });
    assert.equal(failed.status, 503, failure);
    assert.equal((await failed.json()).error.code, 'DEPENDENCY_UNAVAILABLE');
  }
});
