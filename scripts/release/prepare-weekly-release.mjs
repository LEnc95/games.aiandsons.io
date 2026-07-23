import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const statePath = 'release/weekly-state.json';
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const now = new Date(process.env.RELEASE_DATE ? `${process.env.RELEASE_DATE}T12:00:00Z` : Date.now());
const releaseDate = now.toISOString().slice(0, 10);

function isoWeek(date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7) + 3);
  return `${target.getUTCFullYear()}-W${String(1 + Math.round((target - first) / 604800000)).padStart(2, '0')}`;
}

const week = isoWeek(now);
if (state.lastReleasedWeek === week) {
  console.log(`Weekly release ${week} is already prepared.`);
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const [major, minor] = pkg.version.split('.').map(Number);
const nextVersion = `${major}.${minor + 1}.0`;
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const unreleased = changelog.match(/^## Unreleased\s*([\s\S]*?)(?=^## \[)/m);
if (!unreleased || !unreleased[1].trim()) throw new Error('CHANGELOG.md has no Unreleased content to publish.');
const nextChangelog = changelog.replace(
  /^## Unreleased\s*[\s\S]*?(?=^## \[)/m,
  `## Unreleased\n\n## [${nextVersion}] - ${releaseDate}\n${unreleased[1].trim()}\n\n`,
);

let commits = '';
try {
  commits = execFileSync('git', ['log', `--since=${state.lastReleasedAt}T00:00:00Z`, '--pretty=format:- %h %s'], { encoding: 'utf8' }).trim();
} catch {
  commits = '- Commit history unavailable during generation.';
}
const technical = fs.readFileSync('TECHNICAL_CHANGELOG.md', 'utf8');
const technicalEntry = `\n## ${nextVersion} — ${releaseDate}\n\n- Release week: ${week}\n- Automated maintenance validation required before merge.\n- Production verification retries at 0, 5, and 20 minutes.\n\n### Included commits\n\n${commits || '- No commits found in the release window.'}\n`;
const technicalInsert = technical.indexOf('\n## ');
const nextTechnical = technicalInsert >= 0
  ? `${technical.slice(0, technicalInsert)}${technicalEntry}${technical.slice(technicalInsert)}`
  : `${technical.trim()}${technicalEntry}\n`;

pkg.version = nextVersion;
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
lock.version = nextVersion;
if (lock.packages?.['']) lock.packages[''].version = nextVersion;

fs.writeFileSync('CHANGELOG.md', nextChangelog);
fs.writeFileSync('TECHNICAL_CHANGELOG.md', nextTechnical);
fs.writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
fs.writeFileSync('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
fs.writeFileSync('version.json', `${JSON.stringify({ version: nextVersion }, null, 2)}\n`);
fs.writeFileSync(statePath, `${JSON.stringify({ lastReleasedWeek: week, lastReleasedAt: releaseDate, version: nextVersion }, null, 2)}\n`);
console.log(`Prepared weekly release ${nextVersion} for ${week}.`);

