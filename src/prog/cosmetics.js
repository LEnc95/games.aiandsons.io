import { state } from '../core/state.js';

export const pongPaddleStyle = () => {
  switch (state.cosmetics.paddle) {
    case 'sky': return '#6ae0ff';
    case 'plasma': return '#e040fb';
    case 'gold': return '#ffd700';
    default: return '#e7f0ff';
  }
};

export const snakeSkinStyle = () => {
  switch (state.cosmetics.snake) {
    case 'neon': return '#00ff88';
    case 'fire': return '#ff6a00';
    case 'cosmic': return '#b060ff';
    default: return '#4ad';
  }
};

export const marioShirt = () => {
  switch (state.cosmetics.marioShirt) {
    case 'blue': return '#60a5fa';
    case 'green': return '#22c55e';
    case 'gold': return '#fbbf24';
    default: return '#ef4444';
  }
};

