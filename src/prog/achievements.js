import { state, save } from '../core/state.js';
import { recordMissionProgress } from './missions.js';

const badgeDefs = [
  { id:'first-run', name:'First Steps', icon:'??', desc:'Play any game once', test: (ctx) => ctx.anyPlay },
  { id:'pong-pro', name:'Pong Pro', icon:'??', desc:'Win a Pong match by 3+ points', test: (ctx) => ctx.pong && ctx.pong.winMargin >= 3 },
  { id:'pong-king', name:'King of Pong', icon:'??', desc:'Win a Pong match by 5+ points', test: (ctx) => ctx.pong && ctx.pong.winMargin >= 5 },
  { id:'snake-15', name:'Danger Snack', icon:'??', desc:'Reach length 15 in Snake', test: (ctx) => ctx.snake && ctx.snake.length >= 15 },
  { id:'snake-25', name:'World Eater', icon:'??', desc:'Reach length 25 in Snake', test: (ctx) => ctx.snake && ctx.snake.length >= 25 },
  { id:'dino-300', name:'Speedster', icon:'??', desc:'Reach 300+ distance in Dino Run', test: (ctx) => ctx.dino && ctx.dino.dist >= 300 },
  { id:'dino-1000', name:'Meteor Strider', icon:'??', desc:'Reach 1000+ distance in Dino Run', test: (ctx) => ctx.dino && ctx.dino.dist >= 1000 },
  { id:'frogger-10', name:'River Runner', icon:'??', desc:'Score 10+ points in Frogger', test: (ctx) => ctx.frogger && ctx.frogger.score >= 10 },
  { id:'ttt-triple', name:'Big Brain', icon:'??', desc:'Win 3 Tic-Tac-Toe games total', test: (ctx) => (ctx.tttWinsTotal ?? 0) >= 3 },
  { id:'tetris-20-lines', name:'Stack Attack', icon:'??', desc:'Clear 20 lines in Tetris', test: (ctx) => ctx.tetris && ctx.tetris.lines >= 20 },
  { id:'tetris-3000', name:'Tetris Titan', icon:'??', desc:'Reach 3000+ score in Tetris', test: (ctx) => ctx.tetris && ctx.tetris.score >= 3000 },
  { id:'asteroids-wave-5', name:'Rock Hunter', icon:'??', desc:'Reach wave 5 in Asteroids', test: (ctx) => ctx.asteroids && ctx.asteroids.wave >= 5 },
  { id:'asteroids-3000', name:'Deep Space Ace', icon:'??', desc:'Score 3000+ in Asteroids', test: (ctx) => ctx.asteroids && ctx.asteroids.score >= 3000 },
  { id:'bomberman-level-4', name:'Fuse Master', icon:'??', desc:'Reach level 4 in Bomberman Lite', test: (ctx) => ctx.bomberman && ctx.bomberman.level >= 4 },
  { id:'bomberman-crates-40', name:'Demolition Expert', icon:'??', desc:'Destroy 40 crates in one Bomberman run', test: (ctx) => ctx.bomberman && ctx.bomberman.crates >= 40 },
  { id:'daily-mission-complete', name:'Daily Starter', icon:'??', desc:'Complete any daily mission.', test: () => false },
  { id:'daily-mission-sweep', name:'Mission Sweep', icon:'??', desc:'Complete all daily missions in one day.', test: () => false },
  { id:'weekly-challenge-complete', name:'Weekly Challenger', icon:'??', desc:'Complete any weekly challenge.', test: () => false },
  { id:'weekly-challenge-sweep', name:'Weekly Sweep', icon:'??', desc:'Complete all weekly challenges in one week.', test: () => false },
  { id:'assignment-complete', name:'Assignment Ready', icon:'??', desc:'Complete an assigned classroom bundle.', test: () => false },
];

const rewardDefs = [
  { id: 'paddle-plasma', type: 'cosmetic', category: 'paddle', value: 'plasma', name: 'Plasma Paddle', test: (ctx) => ctx.pong && ctx.pong.winMargin >= 3 },
  { id: 'paddle-gold', type: 'cosmetic', category: 'paddle', value: 'gold', name: 'Gold Paddle', test: (ctx) => ctx.pong && ctx.pong.winMargin >= 5 },
  { id: 'paddle-void', type: 'cosmetic', category: 'paddle', value: 'void', name: 'Void Paddle', test: (ctx) => ctx.pong && ctx.pong.winMargin >= 7 },
  { id: 'snake-fire', type: 'cosmetic', category: 'snake', value: 'fire', name: 'Fire Snake', test: (ctx) => ctx.snake && ctx.snake.length >= 18 },
  { id: 'snake-cosmic', type: 'cosmetic', category: 'snake', value: 'cosmic', name: 'Cosmic Snake', test: (ctx) => ctx.snake && ctx.snake.length >= 24 },
  { id: 'snake-glacier', type: 'cosmetic', category: 'snake', value: 'glacier', name: 'Glacier Snake', test: (ctx) => ctx.snake && ctx.snake.length >= 30 },
  { id: 'dino-trail', type: 'inventory', name: 'Meteor Trail', test: (ctx) => ctx.dino && ctx.dino.dist >= 600 },
  { id: 'dino-lightning', type: 'inventory', name: 'Lightning Trail', test: (ctx) => ctx.dino && ctx.dino.dist >= 1200 },
  { id: 'mario-galaxy', type: 'cosmetic', category: 'marioShirt', value: 'galaxy', name: 'Galaxy Shirt', test: (ctx) => ctx.dino && ctx.dino.dist >= 1500 },
  { id: 'frogger-lilypad', type: 'inventory', name: 'Lily Pad Trail', test: (ctx) => ctx.frogger && ctx.frogger.score >= 8 },
  { id: 'frogger-neon-rain', type: 'inventory', name: 'Neon Rain', test: (ctx) => ctx.frogger && ctx.frogger.score >= 15 },
  { id: 'tetris-neon-grid', type: 'inventory', name: 'Neon Grid', test: (ctx) => ctx.tetris && ctx.tetris.lines >= 20 },
  { id: 'tetris-aurora-stack', type: 'inventory', name: 'Aurora Stack', test: (ctx) => ctx.tetris && ctx.tetris.lines >= 45 },
  { id: 'asteroids-plasma-laser', type: 'inventory', name: 'Plasma Laser', test: (ctx) => ctx.asteroids && ctx.asteroids.wave >= 4 },
  { id: 'asteroids-nebula-drift', type: 'inventory', name: 'Nebula Drift', test: (ctx) => ctx.asteroids && ctx.asteroids.score >= 2500 },
  { id: 'bomberman-ember-blast', type: 'inventory', name: 'Ember Blast', test: (ctx) => ctx.bomberman && ctx.bomberman.level >= 3 },
  { id: 'bomberman-jade-maze', type: 'inventory', name: 'Jade Maze', test: (ctx) => ctx.bomberman && ctx.bomberman.level >= 5 },
];

const addCosmeticOwnership = (reward) => {
  const list = Array.isArray(state.cosmeticsOwned?.[reward.category])
    ? state.cosmeticsOwned[reward.category]
    : [];

  if (list.includes(reward.value)) return false;
  state.cosmeticsOwned[reward.category] = [...list, reward.value];
  return true;
};

const addInventoryOwnership = (reward) => {
  if (state.inventory.has(reward.id)) return false;
  state.inventory.add(reward.id);
  return true;
};

export const maybeUnlock = (ctx) => {
  const missionState = recordMissionProgress(ctx);
  const unlockedBadges = [];
  const unlockedRewards = [];
  let changed = false;

  for (const d of badgeDefs) {
    if (!state.badges.has(d.id) && d.test(ctx)) {
      state.badges.add(d.id);
      unlockedBadges.push(d);
      changed = true;
    }
  }

  for (const reward of rewardDefs) {
    if (!reward.test(ctx)) continue;

    const didUnlock = reward.type === 'cosmetic'
      ? addCosmeticOwnership(reward)
      : addInventoryOwnership(reward);

    if (didUnlock) {
      unlockedRewards.push(reward);
      changed = true;
    }
  }

  if (changed) save();

  return { badges: unlockedBadges, rewards: unlockedRewards, missions: missionState };
};

export const listBadges = () => badgeDefs.map((d) => ({ ...d, owned: state.badges.has(d.id) }));
export const listOwnedBadges = () => listBadges().filter((badge) => badge.owned);
