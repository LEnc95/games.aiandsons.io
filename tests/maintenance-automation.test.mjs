import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditReleaseDiff } from '../scripts/automation/audit-release-diff.mjs';
import { generateDiscoveryMetadata } from '../scripts/generate-discovery-metadata.mjs';
import { generateSitemap } from '../scripts/generate-sitemap.mjs';
import { injectSeoTags } from '../scripts/inject-seo.mjs';
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

test('trusted auto-merge uses workflow_run fields that GitHub populates', () => {
  const workflow = fs.readFileSync(
    path.join(process.cwd(), '.github', 'workflows', 'automation-auto-merge.yml'),
    'utf8',
  );
  assert.match(workflow, /workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /startsWith\(github\.event\.workflow_run\.head_branch, 'automation\/'\)/);
  assert.doesNotMatch(workflow, /pull_requests\[0\]\.head\.repo\.full_name/);
});

