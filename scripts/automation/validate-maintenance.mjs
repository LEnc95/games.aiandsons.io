import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../../src/meta/games.js';
import { CHALLENGE_POLICY, DAILY_CHALLENGE_DEFS, WEEKLY_CHALLENGE_DEFS } from '../../src/prog/challenge-catalog.js';
import { PREMIUM_SHOP_ITEM_ID_LIST, SHOP_POLICY } from '../../src/prog/shop-catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function validateMaintenance(root = ROOT) {
  const errors = [];
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
  if (pkg.version !== version.version) errors.push(`package.json version ${pkg.version} does not match version.json ${version.version}.`);

  const newest = GAMES.at(-1);
  if (!newest?.contentContract || newest.releaseDateSource !== 'explicit') {
    errors.push(`Newest game ${newest?.slug || '<missing>'} needs an explicit content contract and release date.`);
  } else {
    if (!Object.keys(newest.contentContract.outcomes || {}).length) errors.push(`Newest game ${newest.slug} has no bounded outcome metrics.`);
    if (!newest.contentContract.cosmeticSlots?.length) errors.push(`Newest game ${newest.slug} has no cosmetic theme slot.`);
    const gamePath = path.join(root, newest.url.replace(/^\/+|\/+$/g, ''), 'index.html');
    const source = fs.existsSync(gamePath) ? fs.readFileSync(gamePath, 'utf8') : '';
    if (!source.includes('reportGameOutcome')) errors.push(`Newest game ${newest.slug} does not report its standardized outcome.`);
  }

  const publicChangelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  if (newest && !publicChangelog.includes(newest.name)) errors.push(`CHANGELOG.md does not mention newest game ${newest.name}.`);
  if (!fs.existsSync(path.join(root, 'TECHNICAL_CHANGELOG.md'))) errors.push('TECHNICAL_CHANGELOG.md is missing.');

  const ids = [...DAILY_CHALLENGE_DEFS, ...WEEKLY_CHALLENGE_DEFS].map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) errors.push('Challenge IDs must be unique.');
  if (CHALLENGE_POLICY.weeklyActiveCount !== 4) errors.push('Weekly automation contract requires four active challenges.');
  const largestWeeklyReward = WEEKLY_CHALLENGE_DEFS
    .map((entry) => entry.rewardCoins)
    .sort((a, b) => b - a)
    .slice(0, CHALLENGE_POLICY.weeklyActiveCount)
    .reduce((sum, value) => sum + value, 0);
  if (largestWeeklyReward > CHALLENGE_POLICY.maxWeeklyRewardCoins) {
    errors.push(`A weekly rotation can award ${largestWeeklyReward} coins; policy maximum is ${CHALLENGE_POLICY.maxWeeklyRewardCoins}.`);
  }

  const shopSource = fs.readFileSync(path.join(root, 'shop.html'), 'utf8');
  const shopIds = new Set([...shopSource.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1]));
  const missingPremiumItems = PREMIUM_SHOP_ITEM_ID_LIST.filter((id) => !shopIds.has(id));
  if (missingPremiumItems.length) errors.push(`Premium catalog IDs missing from shop.html: ${missingPremiumItems.join(', ')}.`);
  if (SHOP_POLICY.weeklyCosmeticCount !== 3) errors.push('Weekly automation contract requires three cosmetics.');

  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = validateMaintenance();
  if (errors.length) {
    console.error('Maintenance validation failed:');
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log('Maintenance validation passed.');
}

