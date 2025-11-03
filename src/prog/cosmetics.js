import { state } from '../core/state.js';

export const pongPaddleStyle = () => {
  switch (state.cosmetics.paddle) {
    case 'sky': return '#6ae0ff';
    default: return '#e7f0ff';
  }
};

export const snakeSkinStyle = () => {
  switch (state.cosmetics.snake) {
    case 'neon': return '#00ff88';
    default: return '#4ad';
  }
};

export const marioShirt = () => {
  switch (state.cosmetics.marioShirt) {
    case 'blue': return '#60a5fa';
    default: return '#ef4444';
  }
};

