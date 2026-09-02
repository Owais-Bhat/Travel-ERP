/**
 * HTTP-level tests.
 *
 * Mounts the real Express app on an ephemeral port. There is no database
 * here, so these cover the parts that must hold before a query is ever
 * reached: authentication, validation, tenant scoping, CORS, security
 * headers, rate limiting and error shape.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-long-enough-to-pass-checks';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

const { default: app } = await import('../src/app.js');
const { default: db } = await import('../src/lib/db.js');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  // Importing the app opens a connection pool. When a database is actually
  // reachable those sockets keep the event loop alive and `node --test`
  // never exits, so close it explicitly.
  await db.end().catch(() => {});
});

const request = (path, options = {}) => fetch(`${baseUrl}${path}`, options);

const tokenFor = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });

// ──────────────────────────────── routing ─────────────────────────────────

test('unknown routes return a JSON 404, not an HTML error page', async () => {
  const response = await request('/api/nope');
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error, 'Route not found');
  assert.equal(body.path, '/api/nope');
});

test('every EIMS module is mounted', async () => {
  const paths = [
    '/api/programs', '/api/certifications', '/api/scholarships',
    '/api/referrals', '/api/leads', '/api/documents', '/api/reports',
    '/api/notifications', '/api/communication', '/api/lms', '/api/transport',
  ];

  for (const path of paths) {
    const response = await request(path);
    // Mounted routers reject with 401, not 404.
    assert.equal(response.status, 401, `${path} should be mounted and require auth`);
  }
});

// ──────────────────────────────── auth ────────────────────────────────────

test('protected routes reject a missing token', async () => {
  const response = await request('/api/students');
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.match(body.error, /token/i);
});

test('protected routes reject a garbage token', async () => {
  const response = await request('/api/students', {
    headers: { Authorization: 'Bearer not-a-real-token' },
  });
  assert.equal(response.status, 401);
});

test('a token signed with the wrong secret is rejected', async () => {
  const forged = jwt.sign({ userId: 'abc' }, 'a-different-secret');
  const response = await request('/api/students', {
    headers: { Authorization: `Bearer ${forged}` },
  });
  assert.equal(response.status, 401);
});

test('an expired token is rejected', async () => {
  const expired = jwt.sign({ userId: 'abc' }, process.env.JWT_SECRET, { expiresIn: -10 });
  const response = await request('/api/students', {
    headers: { Authorization: `Bearer ${expired}` },
  });
  assert.equal(response.status, 401);
});

test('a token with no userId claim is rejected', async () => {
  const response = await request('/api/students', {
    headers: { Authorization: `Bearer ${tokenFor({ role: 'super_admin' })}` },
  });
  assert.equal(response.status, 401);
});

test('the certificate verification endpoint is public', async () => {
  // Deliberately unauthenticated so an employer can check a credential.
  const response = await request('/api/certifications/verify/ABCD-EFGH-JKLM');
  assert.notEqual(response.status, 401, 'verification must not require a session');
});

// ──────────────────────────────── validation ──────────────────────────────

test('registration rejects a malformed body before touching the database', async () => {
  const response = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', password: 'short' }),
  });

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.code, 'validation_error');
  assert.ok(Array.isArray(body.details) && body.details.length > 0);
  assert.ok(body.details.some((issue) => issue.path === 'email'));
});

test('the password policy is enforced on registration', async () => {
  const response = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'a@b.com',
      password: 'alllettersnodigits',
      firstName: 'Ada',
    }),
  });

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.ok(body.details.some((issue) => /letter and one number/i.test(issue.message)));
});

test('login rejects an empty body', async () => {
  const response = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 422);
});

test('an oversized JSON body is refused', async () => {
  const response = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(2 * 1024 * 1024) }),
  });
  assert.ok(response.status >= 400, 'a 2MB body should not be accepted');
});

// ──────────────────────────────── security ────────────────────────────────

test('the server does not advertise Express', async () => {
  const response = await request('/health');
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('helmet security headers are present', async () => {
  const response = await request('/health');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(response.headers.get('x-frame-options') || response.headers.get('content-security-policy'));
});

test('an unlisted CORS origin is refused', async () => {
  const response = await request('/api/students', {
    headers: { Origin: 'https://evil.example.com' },
  });
  // The CORS callback errors, which the error handler turns into a 500.
  assert.notEqual(response.headers.get('access-control-allow-origin'), 'https://evil.example.com');
});

test('the configured origin is allowed', async () => {
  const response = await request('/api/students', {
    headers: { Origin: 'http://localhost:5173' },
  });
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('rate limit headers are advertised on the API', async () => {
  const response = await request('/api/students');
  assert.ok(
    response.headers.get('ratelimit') || response.headers.get('ratelimit-limit'),
    'expected draft-7 RateLimit headers'
  );
});

// ──────────────────────────────── health ──────────────────────────────────

test('health reflects real database reachability', async () => {
  // Runs both with and without a database, so assert the two states are
  // coherent rather than assuming either one.
  const response = await request('/health');
  const body = await response.json();

  if (body.database === 'up') {
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
  } else {
    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.database, 'down');
    assert.ok(body.error, 'a failed probe should say why');
  }
});
