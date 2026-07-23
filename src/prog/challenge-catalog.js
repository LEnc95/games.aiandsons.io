const define = (entry) => Object.freeze({
  ...entry,
  readProgress: (context) => context?.[entry.gameSlug]?.[entry.metric] ?? 0,
});

export const DAILY_CHALLENGE_DEFS = Object.freeze([
  define({ id: 'snake-length-14', gameSlug: 'snake', metric: 'length', name: 'Stretch Goal', desc: 'Reach length 14 in Snake.', target: 14, rewardCoins: 8 }),
  define({ id: 'pong-margin-3', gameSlug: 'pong', metric: 'winMargin', name: 'Paddle Power', desc: 'Win Pong by at least 3 points.', target: 3, rewardCoins: 7 }),
  define({ id: 'tetris-lines-16', gameSlug: 'tetris', metric: 'lines', name: 'Line Cleaner', desc: 'Clear 16 lines in Tetris.', target: 16, rewardCoins: 10 }),
  define({ id: 'asteroids-wave-4', gameSlug: 'asteroids', metric: 'wave', name: 'Field Survivor', desc: 'Reach wave 4 in Asteroids.', target: 4, rewardCoins: 9 }),
  define({ id: 'bomberman-level-3', gameSlug: 'bomberman', metric: 'level', name: 'Maze Breaker', desc: 'Reach level 3 in Bomberman Lite.', target: 3, rewardCoins: 9 }),
  define({ id: 'dino-distance-700', gameSlug: 'dino', metric: 'dist', name: 'Long Sprint', desc: 'Reach 700 distance in Dino Run.', target: 700, rewardCoins: 8 }),
  define({ id: 'frogger-score-12', gameSlug: 'frogger', metric: 'score', name: 'River Champ', desc: 'Score 12 in Frogger.', target: 12, rewardCoins: 8 }),
  define({ id: 'pokemon-badge-1', gameSlug: 'pokemon', metric: 'badges', name: 'Trainer Badge', desc: 'Earn at least 1 badge in Pokemon.', target: 1, rewardCoins: 12 }),
  define({ id: 'tetris-score-2500', gameSlug: 'tetris', metric: 'score', name: 'Stack Scorer', desc: 'Reach 2500 score in Tetris.', target: 2500, rewardCoins: 11 }),
  define({ id: 'colorcatch-score-1200', gameSlug: 'colorcatch', metric: 'score', name: 'Color Chain', desc: 'Reach 1200 score in Color Catch Arcade.', target: 1200, rewardCoins: 10 }),
  define({ id: 'colorcatch-stage-2', gameSlug: 'colorcatch', metric: 'stage', name: 'Stage Sprint', desc: 'Reach stage 2 in Color Catch Arcade.', target: 2, rewardCoins: 9 }),
]);

export const WEEKLY_CHALLENGE_DEFS = Object.freeze([
  define({ id: 'weekly-snake-length-22', gameSlug: 'snake', metric: 'length', name: 'Weekly Snake Master', desc: 'Reach length 22 in Snake.', target: 22, rewardCoins: 14 }),
  define({ id: 'weekly-pong-margin-6', gameSlug: 'pong', metric: 'winMargin', name: 'Weekly Pong Ace', desc: 'Win Pong by at least 6 points.', target: 6, rewardCoins: 14 }),
  define({ id: 'weekly-tetris-lines-40', gameSlug: 'tetris', metric: 'lines', name: 'Weekly Line Boss', desc: 'Clear 40 lines in Tetris.', target: 40, rewardCoins: 18 }),
  define({ id: 'weekly-asteroids-wave-7', gameSlug: 'asteroids', metric: 'wave', name: 'Weekly Deep Space', desc: 'Reach wave 7 in Asteroids.', target: 7, rewardCoins: 18 }),
  define({ id: 'weekly-bomberman-level-5', gameSlug: 'bomberman', metric: 'level', name: 'Weekly Blast Route', desc: 'Reach level 5 in Bomberman Lite.', target: 5, rewardCoins: 17 }),
  define({ id: 'weekly-dino-distance-1800', gameSlug: 'dino', metric: 'dist', name: 'Weekly Dino Dash', desc: 'Reach 1800 distance in Dino Run.', target: 1800, rewardCoins: 15 }),
  define({ id: 'weekly-frogger-score-20', gameSlug: 'frogger', metric: 'score', name: 'Weekly River Captain', desc: 'Score 20 in Frogger.', target: 20, rewardCoins: 14 }),
  define({ id: 'weekly-pokemon-badges-2', gameSlug: 'pokemon', metric: 'badges', name: 'Weekly Gym Push', desc: 'Earn 2 badges in Pokemon.', target: 2, rewardCoins: 20 }),
  define({ id: 'weekly-colorcatch-score-2400', gameSlug: 'colorcatch', metric: 'score', name: 'Weekly Spectrum Rush', desc: 'Reach 2400 score in Color Catch Arcade.', target: 2400, rewardCoins: 18 }),
  define({ id: 'weekly-colorcatch-stage-3', gameSlug: 'colorcatch', metric: 'stage', name: 'Weekly Full Prism', desc: 'Reach stage 3 in Color Catch Arcade.', target: 3, rewardCoins: 17 }),
]);

export const CHALLENGE_POLICY = Object.freeze({
  dailyActiveCount: 3,
  weeklyActiveCount: 4,
  maxDailyRewardCoins: 36,
  maxWeeklyRewardCoins: 80,
});

