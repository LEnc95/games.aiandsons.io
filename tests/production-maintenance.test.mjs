import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyProduction } from '../scripts/qa/production-maintenance-smoke.mjs';

const newest = { slug: 'fixture', name: 'Fixture Game', url: '/fixture' };
function fixture(overrides = {}) {
  const requested = [];
  return { requested, fetchImpl: async (url, options) => {
    assert.equal(options.cache, 'no-store');
    const route = new URL(url).pathname; requested.push(route);
    if (overrides[route]) return overrides[route]();
    if (route === '/sitemap.xml') return new Response('<loc>https://games.aiandsons.io/fixture</loc>', { headers: { 'content-type': 'application/xml' } });
    if (route === '/CHANGELOG.md') return new Response('Added Fixture Game');
    if (route === '/api/auth/firebase-config') return Response.json({ ok: true, enabled: true, config: { projectId: 'fixture-project', apiKey: 'not-for-logs' } });
    if (route === '/api/auth/session') return Response.json({ ok: true, userId: 'not-for-logs', isAuthenticated: false }, { headers: { 'Set-Cookie': 'cade_session=not-for-logs; Path=/; HttpOnly; Secure; SameSite=Lax' } });
    return new Response('Page');
  } };
}

test('production verification covers auth and reports status without account/config values', async () => {
  const mock = fixture();
  const result = await verifyProduction({ baseUrl: 'https://fixture.invalid/', newest, fetchImpl: mock.fetchImpl });
  assert.equal(result.results.length, 10);
  assert.deepEqual(mock.requested.slice(-2), ['/api/auth/firebase-config', '/api/auth/session']);
  assert.equal(JSON.stringify(result).includes('not-for-logs'), false);
});

for (const route of ['/api/auth/firebase-config', '/api/auth/session']) {
  test(`HTTP 500 in ${route} fails even when every static route passed`, async () => {
    const mock = fixture({ [route]: () => new Response('FUNCTION_INVOCATION_FAILED', { status: 500 }) });
    await assert.rejects(verifyProduction({ newest, fetchImpl: mock.fetchImpl }), new RegExp(`${route} returned 500`));
    assert.ok(mock.requested.includes('/fixture'));
  });
}

for (const [name, route, response, message] of [
  ['HTML success page', 'firebase-config', () => new Response('<html>Not an API</html>'), /valid JSON/],
  ['disabled config', 'firebase-config', () => Response.json({ ok: true, enabled: false }), /not configured/],
  ['missing session', 'session', () => Response.json({ ok: true }), /did not initialize/],
  ['API error payload', 'session', () => Response.json({ ok: false }), /readiness/],
  ['missing session cookie', 'session', () => Response.json({ ok: true, userId: 'fixture' }), /session cookie/],
  ['unrelated cookie', 'session', () => Response.json({ ok: true, userId: 'fixture' }, { headers: { 'Set-Cookie': 'other=value' } }), /session cookie/],
]) {
  test(`production verification rejects ${name}`, async () => {
    const mock = fixture({ [`/api/auth/${route}`]: response });
    await assert.rejects(verifyProduction({ newest, fetchImpl: mock.fetchImpl }), message);
  });
}
