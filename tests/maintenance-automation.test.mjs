import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditReleaseDiff } from '../scripts/automation/audit-release-diff.mjs';
import { generateDiscoveryMetadata } from '../scripts/generate-discovery-metadata.mjs';
import { generateSitemap } from '../scripts/generate-sitemap.mjs';
import { cardJobs, generateOgCards } from '../scripts/marketing/og-cards.mjs';
import { parseGameScope } from '../scripts/lib/game-scope.mjs';
import { injectAllSeo, injectSeoTags } from '../scripts/inject-seo.mjs';
import { buildWeeklyPackBrief } from '../scripts/automation/prepare-weekly-pack.mjs';
import { validateMaintenance } from '../scripts/automation/validate-maintenance.mjs';

const silentLogger = { log() {}, warn() {} };

test('maintenance baseline has no drift', () => {
  assert.deepEqual(validateMaintenance(), []);
});

test('weekly brief contains three cosmetics and four challenges across enough games', () => {
  const brief = buildWeeklyPackBrief(new Date('2026-07-22T12:00:00Z'));
  assert.equal(brief.cosmetics.length, 3);
  assert.equal(brief.challenges.length, 4);
  assert.ok(new Set(brief.cosmetics.map((item) => item.gameSlug)).size >= 2);
  assert.ok(new Set(brief.challenges.map((item) => item.gameSlug)).size >= 3);
  assert.equal(brief.challenges.reduce((sum, item) => sum + item.rewardCoinsMaximum, 0), 80);
});

test('SEO injection preserves CRLF and skips byte-identical rewrites', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-generation-'));
  const htmlPath = path.join(directory, 'index.html');
  try {
    fs.writeFileSync(
      htmlPath,
      ['<!doctype html>', '<html>', '<head>', '<title>Old title</title>', '</head>', '<body>Game</body>', '</html>', ''].join('\r\n'),
    );
    const page = {
      kind: 'content',
      url: '/test-game',
      title: 'Test Game | AI and Sons Games',
      desc: 'A deterministic test game.',
    };

    assert.equal(injectSeoTags(htmlPath, page, silentLogger), true);
    const firstPass = fs.readFileSync(htmlPath, 'utf8');
    assert.equal(firstPass.replaceAll('\r\n', '').includes('\n'), false);
    assert.equal(injectSeoTags(htmlPath, page, silentLogger), false);
    assert.equal(fs.readFileSync(htmlPath, 'utf8'), firstPass);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('sitemap generation preserves existing dates and uses an explicit new-game release date', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-generation-'));
  const sitemapPath = path.join(directory, 'sitemap.xml');
  const oldGamePath = path.join(directory, 'old-game');
  const newGamePath = path.join(directory, 'new-game');
  try {
    fs.mkdirSync(oldGamePath);
    fs.mkdirSync(newGamePath);
    fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html>');
    fs.writeFileSync(path.join(oldGamePath, 'index.html'), '<!doctype html>');
    fs.writeFileSync(path.join(newGamePath, 'index.html'), '<!doctype html>');
    fs.writeFileSync(sitemapPath, [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      '  <url>',
      '    <loc>https://games.aiandsons.io/</loc>',
      '    <lastmod>2025-01-02</lastmod>',
      '    <changefreq>weekly</changefreq>',
      '    <priority>1.0</priority>',
      '  </url>',
      '  <url>',
      '    <loc>https://games.aiandsons.io/old-game</loc>',
      '    <lastmod>2025-02-03</lastmod>',
      '    <changefreq>weekly</changefreq>',
      '    <priority>0.8</priority>',
      '  </url>',
      '</urlset>',
      '',
    ].join('\r\n'));

    const pageDefinitions = [
      { route: '/', file: 'index.html' },
      { route: '/old-game', file: 'old-game/index.html', releasedAt: '2024-01-01' },
      { route: '/new-game', file: 'new-game/index.html', releasedAt: '2026-07-23' },
    ];
    assert.equal(generateSitemap({
      root: directory,
      pageDefinitions,
      outputFile: sitemapPath,
      logger: silentLogger,
    }).changed, true);
    const firstPass = fs.readFileSync(sitemapPath, 'utf8');
    assert.match(firstPass, /<loc>https:\/\/games\.aiandsons\.io\/<\/loc>\r\n\s*<lastmod>2025-01-02<\/lastmod>/);
    assert.match(firstPass, /<loc>https:\/\/games\.aiandsons\.io\/old-game<\/loc>\r\n\s*<lastmod>2025-02-03<\/lastmod>/);
    assert.match(firstPass, /<loc>https:\/\/games\.aiandsons\.io\/new-game<\/loc>\r\n\s*<lastmod>2026-07-23<\/lastmod>/);
    assert.equal(firstPass.replaceAll('\r\n', '').includes('\n'), false);
    assert.equal(generateSitemap({
      root: directory,
      pageDefinitions,
      outputFile: sitemapPath,
      logger: silentLogger,
    }).changed, false);
    assert.equal(fs.readFileSync(sitemapPath, 'utf8'), firstPass);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('discovery metadata preserves CRLF and skips byte-identical rewrites', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-generation-'));
  const metadataPath = path.join(directory, '_metadata.cjs');
  try {
    fs.writeFileSync(metadataPath, [
      'const DISCOVERY_GAME_SLUGS = Object.freeze(["old-game"]);',
      'const CURATED_TRENDING_SLUGS = Object.freeze(["alpha"]);',
      'const CURATED_TOP_PLAYED_SLUGS = Object.freeze(["beta"]);',
      'module.exports = { DISCOVERY_GAME_SLUGS, CURATED_TRENDING_SLUGS, CURATED_TOP_PLAYED_SLUGS };',
      '',
    ].join('\r\n'));

    const options = {
      output: metadataPath,
      games: [{ slug: 'alpha' }, { slug: 'beta' }, { slug: 'new-game' }],
      logger: silentLogger,
    };
    assert.equal(generateDiscoveryMetadata(options).changed, true);
    const firstPass = fs.readFileSync(metadataPath, 'utf8');
    assert.equal(firstPass.replaceAll('\r\n', '').includes('\n'), false);
    assert.match(firstPass, /"alpha", "beta", "new-game"/);
    assert.equal(generateDiscoveryMetadata(options).changed, false);
    assert.equal(fs.readFileSync(metadataPath, 'utf8'), firstPass);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const registrySource = (...entries) => `const BASE_GAMES = [
${entries.map((entry) => `  ${entry},`).join('\n')}
];
`;
const existingGame = "{ slug:'existing', name:'Existing', url:'/existing' }";
const newGame = "{ slug:'new-game', name:'New Game', url:'/new-game' }";
const validDailyFiles = [
  'new-game/index.html',
  'assets/og/new-game.png',
  'src/meta/games.js',
  'src/meta/content-contracts.js',
  'api/discovery/_metadata.js',
  'sitemap.xml',
  'index.html',
  'linear/game-issues.csv',
  'linear/labels.md',
  'CHANGELOG.md',
  'progress.md',
];

test('daily release audit accepts one complete game and its generated support files', () => {
  assert.deepEqual(auditReleaseDiff({
    files: validDailyFiles,
    lane: 'daily-game',
    baseGamesSource: registrySource(existingGame),
    headGamesSource: registrySource(existingGame, newGame),
  }), []);
});

test('daily release audit rejects unrelated paths and edits to existing registry entries', () => {
  const errors = auditReleaseDiff({
    files: [...validDailyFiles, 'scripts/unrelated.mjs'],
    lane: 'daily-game',
    baseGamesSource: registrySource(existingGame),
    headGamesSource: registrySource(
      "{ slug:'existing', name:'Changed Existing', url:'/existing' }",
      newGame,
    ),
  });
  assert.ok(errors.some((error) => error.includes('must not edit existing registry entries')));
  assert.ok(errors.some((error) => error.includes('outside the new-game allowlist')));
});

test('daily release audit rejects a second game entry and folder', () => {
  const errors = auditReleaseDiff({
    files: [...validDailyFiles, 'second-game/index.html', 'assets/og/second-game.png'],
    lane: 'daily-game',
    baseGamesSource: registrySource(existingGame),
    headGamesSource: registrySource(
      existingGame,
      newGame,
      "{ slug:'second-game', name:'Second Game', url:'/second-game' }",
    ),
  });
  assert.ok(errors.some((error) => error.includes('exactly one registry entry')));
});

test('weekly release audit retains the three-game-shell limit without the daily allowlist', () => {
  assert.deepEqual(auditReleaseDiff({
    files: ['alpha/index.html', 'beta/index.html', 'gamma/index.html', 'scripts/content-pack.mjs'],
    lane: 'weekly-pack',
  }), []);
  const errors = auditReleaseDiff({
    files: ['alpha/index.html', 'beta/index.html', 'gamma/index.html', 'delta/index.html'],
    lane: 'weekly-pack',
  });
  assert.ok(errors.some((error) => error.includes('maximum is 3')));
});

test('weekly release audit accepts only the synchronized release files', () => {
  const files = [
    'CHANGELOG.md', 'TECHNICAL_CHANGELOG.md', 'package.json',
    'package-lock.json', 'version.json', 'release/weekly-state.json',
  ];
  assert.deepEqual(auditReleaseDiff({ files, lane: 'weekly-release' }), []);
  const errors = auditReleaseDiff({ files: [...files, 'api/social.js'], lane: 'weekly-release' });
  assert.ok(errors.some((error) => error.includes('outside its allowlist')));
  const missing = auditReleaseDiff({ files: files.slice(1), lane: 'weekly-release' });
  assert.ok(missing.some((error) => error.includes('missing required paths')));
});

test('weekly content workflow deduplicates and supersedes generated work items', () => {
  const workflow = fs.readFileSync(
    path.join(process.cwd(), '.github', 'workflows', 'weekly-content-pack.yml'),
    'utf8',
  );
  assert.match(workflow, /LABEL="automation:weekly-pack"/);
  assert.match(workflow, /gh issue list --state all --search "\$\{TITLE\} in:title"/);
  assert.match(workflow, /select\(\.title == \\"\$\{TITLE\}\\"\)/);
  assert.match(workflow, /gh issue close "\$NUMBER" --reason "not planned"/);
  assert.match(workflow, /Superseded by #\$\{CURRENT_NUMBER\}/);
});

test('trusted auto-merge uses workflow_run fields that GitHub populates', () => {
  const workflow = fs.readFileSync(
    path.join(process.cwd(), '.github', 'workflows', 'automation-auto-merge.yml'),
    'utf8',
  );
  assert.match(workflow, /workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /startsWith\(github\.event\.workflow_run\.head_branch, 'automation\/'\)/);
  assert.doesNotMatch(workflow, /pull_requests\[0\]\.head\.repo\.full_name/);
  assert.match(
    workflow,
    /if ! gh pr checks "\$PR_NUMBER"[\s\S]+refusing to merge\.[\s\S]+fi\s+gh pr merge "\$PR_NUMBER"/,
    'trusted auto-merge must fail closed on PR checks before invoking merge',
  );
});

test('trusted weekly release merge requires the validated commit and release-only files', () => {
  const workflow = fs.readFileSync(
    path.join(process.cwd(), '.github', 'workflows', 'automation-auto-merge.yml'),
    'utf8',
  );
  assert.match(workflow, /workflow_run\.event == 'workflow_dispatch'/);
  assert.match(workflow, /workflow_run\.head_branch, 'automation\/weekly-release\/'/);
  assert.match(workflow, /\[ "\$PR_HEAD_SHA" != "\$RUN_HEAD_SHA" \]/);
  assert.match(workflow, /\[ "\$ACTUAL_FILES" != "\$EXPECTED_FILES" \]/);
  assert.match(workflow, /--match-head-commit "\$RUN_HEAD_SHA"/);
});



test('existing game SEO is byte-identical on the first regeneration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-existing-'));
  try {
    for (const slug of ['stampstudio', 'sketchclash', 'auroraaccord']) {
      const source = fs.readFileSync(new URL(`../${slug}/index.html`, import.meta.url), 'utf8');
      const normalized = source.replace(/\r\n/g, '\n');
      const title = normalized.match(/<title>(.*?)<\/title>/)[1];
      const desc = normalized.match(/<meta name="description" content="(.*?)">/)[1];
      for (const eol of ['\n', '\r\n']) {
        const fixture = normalized.replace(/\n/g, eol);
        const file = path.join(root, `${slug}.html`);
        fs.writeFileSync(file, fixture);
        const page = { kind: 'game', url: `/${slug}`, title, desc,
          gameName: title.split(' | ')[0], image: `https://games.aiandsons.io/assets/og/${slug}.png` };
        assert.equal(injectSeoTags(file, page, silentLogger), false, `${slug} ${JSON.stringify(eol)}`);
        assert.equal(fs.readFileSync(file, 'utf8'), fixture);
        const changed = { ...page, desc: 'Changed description.' };
        assert.equal(injectSeoTags(file, changed, silentLogger), true);
        assert.equal(injectSeoTags(file, changed, silentLogger), false);
        assert.equal(fs.readFileSync(file, 'utf8'), fixture.replaceAll(desc, changed.desc));
      }
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('scoped SEO touches only homepage and selected game; invalid scope writes nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-scope-'));
  try {
    for (const slug of ['stampstudio', 'sketchclash']) fs.mkdirSync(path.join(root, slug));
    const html = '<html><head><title>Old</title></head><body>Keep me</body></html>';
    for (const file of ['index.html', 'stampstudio/index.html', 'sketchclash/index.html']) fs.writeFileSync(path.join(root, file), html);
    assert.throws(() => injectAllSeo({ root, slug: 'missing-game', logger: silentLogger }), /Unknown game slug/);
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), html);
    injectAllSeo({ root, slug: 'stampstudio', logger: silentLogger });
    assert.match(fs.readFileSync(path.join(root, 'stampstudio/index.html'), 'utf8'), /Stamp Studio/);
    assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /ItemList/);
    assert.equal(fs.readFileSync(path.join(root, 'sketchclash/index.html'), 'utf8'), html);
    const before = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    injectAllSeo({ root, slug: 'stampstudio', logger: silentLogger });
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('scoped OG generation preserves every existing card and banner', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'og-scope-'));
  try {
    fs.mkdirSync(path.join(root, 'assets', 'og'), { recursive: true });
    for (const file of ['assets/social-banner.png', 'assets/og/sketchclash.png']) fs.writeFileSync(path.join(root, file), 'existing bytes');
    const render = async (html, output) => { assert.match(html, /Stamp Studio/); fs.writeFileSync(output, 'new card'); };
    assert.equal(await generateOgCards({ root, slug: 'stampstudio' }, render), 1);
    assert.equal(fs.readFileSync(path.join(root, 'assets/social-banner.png'), 'utf8'), 'existing bytes');
    assert.equal(fs.readFileSync(path.join(root, 'assets/og/sketchclash.png'), 'utf8'), 'existing bytes');
    assert.equal(fs.readFileSync(path.join(root, 'assets/og/stampstudio.png'), 'utf8'), 'new card');
    assert.throws(() => cardJobs({ slug: 'missing-game' }), /Unknown game slug/);
    assert.throws(() => cardJobs({ slug: 'stampstudio', defaultOnly: true }), /cannot be combined/);
    assert.equal(cardJobs({ defaultOnly: true }).length, 1);
    assert.equal(cardJobs({ limit: 2 }).length, 3);
    assert.deepEqual(parseGameScope(['--slug', 'stampstudio']), { slug: 'stampstudio' });
    for (const args of [['--slug'], ['--slug', '--limit'], ['--slgu', 'stampstudio'], ['--slug', 'stampstudio', '--default-only']]) {
      assert.throws(() => parseGameScope(args), /Usage/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
