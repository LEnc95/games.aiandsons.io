// Client-side score card → PNG, for download or native share at game over.
//
// Works for every game (canvas-based or DOM-based) because it draws its own
// offscreen canvas rather than capturing the game. Visual language is kept in
// sync with the pre-rendered OG cards (scripts/marketing/og-cards.mjs) so a
// shared score card and a link unfurl look like the same brand.
import { nativeShare } from './share.js';

const THEME = {
  bg1: '#1a0b2e',
  bg2: '#2a1149',
  accent: '#fbbf24',
  text: '#ffffff',
  sub: '#a7b8df',
};

const CARD_W = 1200;
const CARD_H = 630;

export const renderScoreCardBlob = async ({
  emoji = '\u{1F3AE}',
  name = 'AI & Sons Arcade',
  score = 0,
  scoreHint = 'score',
  handle = '',
} = {}) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  gradient.addColorStop(0, THEME.bg1);
  gradient.addColorStop(1, THEME.bg2);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.strokeStyle = THEME.accent;
  ctx.lineWidth = 12;
  ctx.strokeRect(26, 26, CARD_W - 52, CARD_H - 52);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.font = '150px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.fillText(emoji, CARD_W / 2, 230);

  ctx.fillStyle = THEME.text;
  ctx.font = 'bold 62px system-ui, sans-serif';
  ctx.fillText(String(name).slice(0, 28), CARD_W / 2, 312);

  ctx.fillStyle = THEME.accent;
  ctx.font = 'bold 116px system-ui, sans-serif';
  ctx.fillText(Number(score).toLocaleString(), CARD_W / 2, 446);

  ctx.fillStyle = THEME.sub;
  ctx.font = '34px system-ui, sans-serif';
  ctx.fillText(String(scoreHint || 'score'), CARD_W / 2, 496);

  ctx.fillStyle = THEME.text;
  ctx.font = '30px system-ui, sans-serif';
  const credit = handle ? `${String(handle).slice(0, 24)}  •  ` : '';
  ctx.fillText(`${credit}games.aiandsons.io`, CARD_W / 2, 568);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
};

export const downloadBlob = (blob, filename) => {
  if (!blob || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

// Build the card and offer it via the native share sheet (with image file when
// supported) or fall back to a download. Returns true if a card was produced.
export const shareScoreCard = async ({ slug, name, emoji, score, scoreHint, handle } = {}) => {
  const blob = await renderScoreCardBlob({ emoji, name, score, scoreHint, handle });
  if (!blob) return false;
  const filename = `${slug || 'arcade'}-score-${Number(score) || 0}.png`;
  const text = `My ${name} score: ${Number(score).toLocaleString()}! Play free at games.aiandsons.io`;

  let file = null;
  try {
    file = new File([blob], filename, { type: 'image/png' });
  } catch {
    file = null;
  }

  const shared = file
    ? await nativeShare({ title: `${name} — ${Number(score).toLocaleString()}`, text, files: [file] })
    : false;

  if (!shared) downloadBlob(blob, filename);
  return true;
};
