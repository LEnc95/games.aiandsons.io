import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_UNATTENDED_PATHS = 40;
const DAILY_FIXED_PATHS = new Set([
  'src/meta/games.js',
  'src/meta/content-contracts.js',
  'api/discovery/_metadata.js',
  'sitemap.xml',
  'index.html',
  'linear/game-issues.csv',
  'linear/labels.md',
  'progress.md',
  'SPRINT_BOARD.md',
  'CHANGELOG.md',
]);
const DAILY_REQUIRED_FIXED_PATHS = [
  'src/meta/games.js',
  'src/meta/content-contracts.js',
  'api/discovery/_metadata.js',
  'sitemap.xml',
  'index.html',
  'linear/game-issues.csv',
  'linear/labels.md',
  'CHANGELOG.md',
];

function findBaseGamesArray(source) {
  const marker = /\bconst\s+BASE_GAMES\s*=\s*\[/m.exec(source);
  if (!marker) throw new Error('Could not find the BASE_GAMES registry.');
  return marker.index + marker[0].lastIndexOf('[');
}

export function parseBaseGameEntries(source) {
  const text = String(source || '');
  const arrayStart = findBaseGamesArray(text);
  const entries = [];
  let arrayDepth = 1;
  let objectDepth = 0;
  let objectStart = -1;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = arrayStart + 1; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '[') {
      arrayDepth += 1;
      continue;
    }
    if (char === ']') {
      arrayDepth -= 1;
      if (arrayDepth === 0) break;
      continue;
    }
    if (char === '{') {
      if (arrayDepth === 1 && objectDepth === 0) objectStart = index;
      objectDepth += 1;
      continue;
    }
    if (char === '}' && objectDepth > 0) {
      objectDepth -= 1;
      if (objectDepth === 0 && objectStart >= 0) {
        const raw = text.slice(objectStart, index + 1).trim();
        const slug = /\bslug\s*:\s*['"]([a-z0-9]+(?:-[a-z0-9]+)*)['"]/i.exec(raw)?.[1];
        if (!slug) throw new Error('A BASE_GAMES entry is missing a valid literal slug.');
        entries.push({ slug, raw });
        objectStart = -1;
      }
    }
  }

  if (arrayDepth !== 0) throw new Error('The BASE_GAMES registry array is not closed.');
  const uniqueSlugs = new Set(entries.map((entry) => entry.slug));
  if (uniqueSlugs.size !== entries.length) throw new Error('The BASE_GAMES registry contains duplicate slugs.');
  return entries;
}

function auditDailyGameDiff(files, baseGamesSource, headGamesSource) {
  const errors = [];
  let baseEntries;
  let headEntries;
  try {
    baseEntries = parseBaseGameEntries(baseGamesSource);
    headEntries = parseBaseGameEntries(headGamesSource);
  } catch (error) {
    return [`Unable to compare the daily game registry: ${error.message}`];
  }

  const baseBySlug = new Map(baseEntries.map((entry) => [entry.slug, entry]));
  const headBySlug = new Map(headEntries.map((entry) => [entry.slug, entry]));
  const addedSlugs = headEntries
    .map((entry) => entry.slug)
    .filter((slug) => !baseBySlug.has(slug));
  const removedSlugs = baseEntries
    .map((entry) => entry.slug)
    .filter((slug) => !headBySlug.has(slug));
  const changedExistingSlugs = baseEntries
    .filter((entry) => headBySlug.has(entry.slug) && headBySlug.get(entry.slug).raw !== entry.raw)
    .map((entry) => entry.slug);

  if (addedSlugs.length !== 1) {
    errors.push(`Daily game releases must add exactly one registry entry; found ${addedSlugs.length}.`);
  }
  if (removedSlugs.length) {
    errors.push(`Daily game releases must not remove registry entries: ${removedSlugs.join(', ')}.`);
  }
  if (changedExistingSlugs.length) {
    errors.push(`Daily game releases must not edit existing registry entries: ${changedExistingSlugs.join(', ')}.`);
  }
  if (addedSlugs.length !== 1) return errors;

  const slug = addedSlugs[0];
  if (headEntries.at(-1)?.slug !== slug) {
    errors.push(`The new registry entry must be appended as the newest game; found ${slug} elsewhere in BASE_GAMES.`);
  }

  const requiredPaths = [
    ...DAILY_REQUIRED_FIXED_PATHS,
    `${slug}/index.html`,
    `assets/og/${slug}.png`,
  ];
  const missingPaths = requiredPaths.filter((file) => !files.includes(file));
  if (missingPaths.length) {
    errors.push(`Daily game release is missing required paths: ${missingPaths.join(', ')}.`);
  }

  const unexpectedPaths = files.filter((file) => (
    !DAILY_FIXED_PATHS.has(file)
    && !file.startsWith(`${slug}/`)
    && file !== `assets/og/${slug}.png`
  ));
  if (unexpectedPaths.length) {
    errors.push(`Daily game release contains paths outside the ${slug} allowlist: ${unexpectedPaths.join(', ')}.`);
  }

  const changedTopLevelGameShells = files.filter((file) => /^[^/]+\/index\.html$/.test(file));
  const unexpectedGameShells = changedTopLevelGameShells.filter((file) => file !== `${slug}/index.html`);
  if (changedTopLevelGameShells.filter((file) => file === `${slug}/index.html`).length !== 1) {
    errors.push(`Daily game release must contain exactly one matching top-level game shell: ${slug}/index.html.`);
  }
  if (unexpectedGameShells.length) {
    errors.push(`Daily game release contains additional top-level game shells: ${unexpectedGameShells.join(', ')}.`);
  }

  return errors;
}

export function auditReleaseDiff({
  files,
  lane = '',
  baseGamesSource = '',
  headGamesSource = '',
}) {
  const normalizedLane = String(lane || '').trim().toLowerCase();
  const normalizedFiles = [...new Set(files.map((file) => String(file).trim()).filter(Boolean))];
  const errors = [];

  const forbidden = normalizedFiles.filter((file) => (
    /(^|\/)(\.env|\.npmrc|id_rsa|credentials?)(\.|$)/i.test(file)
    || /service.account|secret/i.test(file)
    || file.startsWith('.git/')
  ));
  if (forbidden.length) {
    errors.push(`Automation diff contains forbidden sensitive paths: ${forbidden.join(', ')}.`);
  }

  if (normalizedFiles.length > MAX_UNATTENDED_PATHS) {
    errors.push(`Automation diff changes ${normalizedFiles.length} paths; maximum unattended release size is ${MAX_UNATTENDED_PATHS}.`);
  }

  if (normalizedLane === 'daily-game') {
    errors.push(...auditDailyGameDiff(normalizedFiles, baseGamesSource, headGamesSource));
  } else if (normalizedLane === 'weekly-pack') {
    const gameShells = normalizedFiles.filter((file) => /^[^/]+\/index\.html$/.test(file));
    if (gameShells.length > 3) {
      errors.push(`Weekly pack changes ${gameShells.length} game shells; maximum is 3.`);
    }
  }

  return errors;
}

function gitOutput(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

export function runAudit({
  base = process.env.AUTOMATION_BASE_SHA || process.env.GITHUB_BASE_REF || 'origin/main',
  lane = process.env.AUTOMATION_LANE || '',
} = {}) {
  let mergeBase;
  let files;
  let baseGamesSource = '';
  let headGamesSource = '';
  try {
    mergeBase = gitOutput(['merge-base', base, 'HEAD']);
    files = gitOutput(['diff', '--name-only', mergeBase, 'HEAD'])
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (String(lane).trim().toLowerCase() === 'daily-game') {
      baseGamesSource = gitOutput(['show', `${mergeBase}:src/meta/games.js`]);
      headGamesSource = gitOutput(['show', 'HEAD:src/meta/games.js']);
    }
  } catch (error) {
    console.error(`Unable to audit automation diff from ${base}: ${error.message}`);
    return 1;
  }

  const errors = auditReleaseDiff({ files, lane, baseGamesSource, headGamesSource });
  if (errors.length) {
    for (const error of errors) console.error(error);
    return 1;
  }

  const normalizedLane = String(lane || '').trim().toLowerCase();
  console.log(`Automation diff audit passed for ${files.length} path(s)${normalizedLane ? ` in ${normalizedLane} lane` : ''}.`);
  return 0;
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === path.resolve(__filename).toLowerCase();

if (isMain) {
  process.exitCode = runAudit();
}
