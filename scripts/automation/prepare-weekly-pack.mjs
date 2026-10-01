import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../../src/meta/games.js';
import { CHALLENGE_POLICY } from '../../src/prog/challenge-catalog.js';
import { SHOP_POLICY } from '../../src/prog/shop-catalog.js';

function weekKey(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((date - first) / 604800000);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function hash(value) {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function buildWeeklyPackBrief(now = new Date()) {
  const week = weekKey(now);
  const eligible = GAMES
    .filter((game) => game.contentContract?.cosmeticSlots?.length && Object.keys(game.contentContract.outcomes || {}).length)
    .sort((a, b) => hash(`${week}:${a.slug}`) - hash(`${week}:${b.slug}`));
  if (eligible.length < SHOP_POLICY.minimumGamesPerPack) {
    throw new Error(`Weekly pack needs ${SHOP_POLICY.minimumGamesPerPack} contract-ready games; found ${eligible.length}.`);
  }

  const cosmeticGames = eligible.slice(0, SHOP_POLICY.weeklyCosmeticCount);
  const primaryMetrics = eligible.map((game) => {
    const [metric, bounds] = Object.entries(game.contentContract.outcomes)[0];
    return { game, metric, bounds };
  });
  const secondaryMetrics = eligible.flatMap((game) => Object.entries(game.contentContract.outcomes)
    .slice(1).map(([metric, bounds]) => ({ game, metric, bounds })));
  const metricCandidates = [...primaryMetrics, ...secondaryMetrics];
  if (metricCandidates.length < CHALLENGE_POLICY.weeklyActiveCount) throw new Error('Not enough bounded outcome metrics for four challenges.');

  return {
    schemaVersion: 1,
    weekKey: week,
    constraints: {
      cosmetics: SHOP_POLICY.weeklyCosmeticCount,
      challenges: CHALLENGE_POLICY.weeklyActiveCount,
      maximumWeeklyRewardCoins: CHALLENGE_POLICY.maxWeeklyRewardCoins,
      generatedPriceRange: [SHOP_POLICY.minGeneratedPrice, SHOP_POLICY.maxGeneratedPrice],
      prohibited: ['network calls', 'new storage keys', 'dependencies', 'billing changes', 'free-form telemetry'],
    },
    cosmetics: cosmeticGames.map((game, index) => ({
      gameSlug: game.slug,
      gameName: game.name,
      slot: game.contentContract.cosmeticSlots[index % game.contentContract.cosmeticSlots.length],
      requiredProof: ['shop preview screenshot', 'in-game before screenshot', 'in-game equipped screenshot'],
    })),
    challenges: metricCandidates.slice(0, CHALLENGE_POLICY.weeklyActiveCount).map(({ game, metric, bounds }, index) => ({
      gameSlug: game.slug,
      gameName: game.name,
      metric,
      bounds,
      rewardCoinsMaximum: Math.floor(CHALLENGE_POLICY.maxWeeklyRewardCoins / CHALLENGE_POLICY.weeklyActiveCount),
      requiredProof: `synthetic ${metric} outcome completes and rewards exactly once`,
      sequence: index + 1,
    })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const brief = buildWeeklyPackBrief();
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
    const output = path.resolve(process.argv[outputIndex + 1]);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(brief, null, 2)}\n`);
    console.log(`Weekly pack brief written to ${output}`);
  } else {
    console.log(JSON.stringify(brief, null, 2));
  }
}
