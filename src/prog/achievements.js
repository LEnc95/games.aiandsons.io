import { state, save } from '../core/state.js';

const defs = [
  { id:'first-run',   name:'First Steps',       desc:'Play any game once',            test: (ctx) => ctx.anyPlay },
  { id:'pong-king',   name:'King of Pong',      desc:'Win by 5+ points',              test: (ctx) => ctx.pong && ctx.pong.winMargin >= 5 },
  { id:'snake-15',    name:'Danger Snack',     desc:'Reach length 15 in Snake',      test: (ctx) => ctx.snake && ctx.snake.length >= 15 },
  { id:'dino-300',    name:'Speedster',         desc:'300+ distance in Dino',         test: (ctx) => ctx.dino && ctx.dino.dist >= 300 },
  { id:'ttt-triple',  name:'Big Brain',         desc:'3 Tic-Tac-Toe wins total',      test: (ctx) => (ctx.tttWinsTotal ?? 0) >= 3 },
];

export const maybeUnlock = (ctx) => {
  let unlocked = [];

  for (const d of defs) {
    if (!state.badges.has(d.id) && d.test(ctx)) {
      state.badges.add(d.id);
      unlocked.push(d);
    }
  }

  if (unlocked.length) {
    save();
  }

  return unlocked;
};

export const listBadges = () => defs.map(d => ({...d, owned: state.badges.has(d.id)}));

