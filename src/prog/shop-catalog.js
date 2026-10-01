// Shared policy for the existing shop and weekly pack generator. The item
// catalog will migrate out of shop.html in compatibility-safe batches.
export const SHOP_POLICY = Object.freeze({
  weeklyCosmeticCount: 3,
  minGeneratedPrice: 20,
  maxGeneratedPrice: 90,
  minimumGamesPerPack: 2,
});

export const PREMIUM_SHOP_ITEM_ID_LIST = Object.freeze([
  'paddle-gold', 'paddle-void', 'snake-cosmic', 'snake-glacier',
  'mario-gold', 'mario-galaxy', 'ski-gold-skier', 'spaceinvaders-omega',
  'frogger-neon-rain', 'tetris-aurora-stack', 'asteroids-nebula-drift',
  'bomberman-jade-maze', 'tictactoe-candy-marks', 'rps-cyber-throw',
  'memory-rainbow-match', 'breakout-crystal-wall', 'connect4-royal-frame',
  'minesweeper-moonfield', 'flappy-rainbow-pipes', 'dino-night-runner',
  'spaceinvaders-starfield', 'frogger-golden-logs', 'ski-northern-lights',
  '2048-galaxy-numbers', 'tetris-meteor-well', 'asteroids-solar-sail',
  'bomberman-shadow-arena', 'colorcatch-rainbow-bucket',
]);

const PREMIUM_SHOP_ITEM_IDS = new Set(PREMIUM_SHOP_ITEM_ID_LIST);
export const isPremiumCatalogItem = (itemOrId) => PREMIUM_SHOP_ITEM_IDS.has(
  typeof itemOrId === 'string' ? itemOrId : itemOrId?.id,
);

