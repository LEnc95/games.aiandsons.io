import { state } from '../core/state.js';

export const pongPaddleStyle = () => {
  switch (state.cosmetics.paddle) {
    case 'sky': return '#6ae0ff';
    case 'plasma': return '#e040fb';
    case 'void': return '#7c3aed';
    case 'gold': return '#ffd700';
    default: return '#e7f0ff';
  }
};

export const snakeSkinStyle = () => {
  switch (state.cosmetics.snake) {
    case 'neon': return '#00ff88';
    case 'fire': return '#ff6a00';
    case 'glacier': return '#7dd3fc';
    case 'cosmic': return '#b060ff';
    default: return '#4ad';
  }
};

export const marioShirt = () => {
  switch (state.cosmetics.marioShirt) {
    case 'blue': return '#60a5fa';
    case 'green': return '#22c55e';
    case 'galaxy': return '#8b5cf6';
    case 'gold': return '#fbbf24';
    default: return '#ef4444';
  }
};

export const memoryCardBackStyle = () => {
  switch (state.cosmetics.memoryCardBack) {
    case 'holo':
      return 'holo';
    case 'prismatic':
      return 'prismatic';
    default:
      return 'default';
  }
};

/** Bottom of the Ninth broadcast palette tokens (contract: broadcast-theme). */
export const broadcastThemeStyle = () => {
  switch (state.cosmetics.broadcastTheme) {
    case 'night-signal':
      return {
        background: '#070b14',
        panel: '#121c30',
        accent: '#41b6e6',
        score: '#e8f4ff',
        warning: '#7dd3fc',
      };
    case 'day-call':
      return {
        background: '#1a2438',
        panel: '#243552',
        accent: '#e8a317',
        score: '#fff8e7',
        warning: '#ffd56a',
      };
    default:
      return {
        background: '#0b1220',
        panel: '#162238',
        accent: '#c41230',
        score: '#f2f5fa',
        warning: '#f0c14b',
      };
  }
};
