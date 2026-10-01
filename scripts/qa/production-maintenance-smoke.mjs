import { GAMES } from '../../src/meta/games.js';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}
const baseUrl = String(args.get('--base-url') || 'https://games.aiandsons.io').replace(/\/+$/, '');
const newest = GAMES.at(-1);
const routes = ['/', '/shop.html', '/changelog', '/CHANGELOG.md', '/TECHNICAL_CHANGELOG.md', '/version.json', newest.url];

const results = [];
for (const route of routes) {
  const response = await fetch(`${baseUrl}${route}`, { redirect: 'follow', cache: 'no-store' });
  results.push({ route, status: response.status, ok: response.ok });
  if (!response.ok) throw new Error(`Production route ${route} returned ${response.status}.`);
  if (route === '/CHANGELOG.md') {
    const body = await response.text();
    if (!body.includes(newest.name)) throw new Error(`Production changelog does not mention ${newest.name}.`);
  }
}

console.log(JSON.stringify({ ok: true, baseUrl, newestGame: newest.slug, results }, null, 2));

