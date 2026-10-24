import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../../src/meta/games.js';

export async function verifyProduction({ baseUrl = 'https://games.aiandsons.io', newest = GAMES.at(-1), fetchImpl = fetch } = {}) {
  baseUrl = baseUrl.replace(/\/+$/, '');
  const routes = ['/', '/shop.html', '/changelog', '/CHANGELOG.md', '/TECHNICAL_CHANGELOG.md', '/version.json', '/sitemap.xml', newest.url,
    '/api/auth/firebase-config', '/api/auth/session'];
  const results = [];
  for (const route of routes) {
    const response = await fetchImpl(`${baseUrl}${route}`, { redirect: 'follow', cache: 'no-store' });
    results.push({ route, status: response.status, ok: response.ok });
    if (!response.ok) throw new Error(`Production route ${route} returned ${response.status}.`);
    if (route === '/sitemap.xml') {
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('xml')) throw new Error(`Production sitemap content-type was ${contentType || '<missing>'}.`);
      const body = await response.text();
      let normalized = newest.url.startsWith('/') ? newest.url : `/${newest.url}`;
      if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
      if (!body.includes(`<loc>https://games.aiandsons.io${normalized}</loc>`)) {
        throw new Error(`Production sitemap is missing the newest game route for ${newest.slug}.`);
      }
    }
    if (route === '/CHANGELOG.md' && !(await response.text()).includes(newest.name)) {
      throw new Error(`Production changelog does not mention ${newest.name}.`);
    }
    if (route.startsWith('/api/auth/')) {
      let body;
      try { body = await response.json(); }
      catch { throw new Error(`Production auth route ${route} did not return valid JSON.`); }
      if (body?.ok !== true) throw new Error(`Production auth route ${route} did not report readiness.`);
      if (route.endsWith('firebase-config') && (body.enabled !== true || !body.config?.projectId)) {
        throw new Error('Production Firebase web authentication is not configured.');
      }
      if (route.endsWith('session') && (typeof body.userId !== 'string' || !body.userId)) {
        throw new Error('Production anonymous session did not initialize.');
      }
      // Do not log config values, session identifiers, or Set-Cookie headers.
    }
  }
  return { ok: true, baseUrl, newestGame: newest.slug, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
  try { console.log(JSON.stringify(await verifyProduction({ baseUrl: args.get('--base-url') }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

