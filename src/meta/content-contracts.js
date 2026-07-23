// Engagement contracts are intentionally separate from launcher copy. New games
// must add an explicit contract so automated challenges and cosmetics never
// guess at unbounded metrics or promise effects a game cannot render.
export const GAME_CONTENT_CONTRACTS = Object.freeze({
  pong: Object.freeze({
    releasedAt: '2026-02-13',
    outcomes: Object.freeze({ winMargin: Object.freeze({ min: 0, max: 20, direction: 'higher' }) }),
    cosmeticSlots: Object.freeze([Object.freeze({ key: 'paddle', kind: 'palette', tokens: Object.freeze(['color']) })]),
  }),
  snake: Object.freeze({
    releasedAt: '2026-02-19',
    outcomes: Object.freeze({ length: Object.freeze({ min: 1, max: 500, direction: 'higher' }) }),
    cosmeticSlots: Object.freeze([Object.freeze({ key: 'snake', kind: 'palette', tokens: Object.freeze(['color', 'glow']) })]),
  }),
  tetris: Object.freeze({
    releasedAt: '2026-03-15',
    outcomes: Object.freeze({
      score: Object.freeze({ min: 0, max: 2000000, direction: 'higher' }),
      lines: Object.freeze({ min: 0, max: 1000, direction: 'higher' }),
      level: Object.freeze({ min: 0, max: 100, direction: 'higher' }),
    }),
    cosmeticSlots: Object.freeze([Object.freeze({ key: 'well-theme', kind: 'palette', tokens: Object.freeze(['board', 'blocks', 'glow']) })]),
  }),
  lureline: Object.freeze({
    releasedAt: '2026-07-21',
    outcomes: Object.freeze({
      score: Object.freeze({ min: 0, max: 500, direction: 'higher' }),
      caught: Object.freeze({ min: 0, max: 50, direction: 'higher' }),
      ponds: Object.freeze({ min: 0, max: 3, direction: 'higher' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'water-theme', kind: 'palette', tokens: Object.freeze(['water', 'sky', 'accent', 'sparkle']) }),
      Object.freeze({ key: 'reel-trail', kind: 'trail', tokens: Object.freeze(['color', 'glow', 'particle']) }),
    ]),
  }),
});

export const getGameContentContract = (slug) => GAME_CONTENT_CONTRACTS[String(slug || '').trim()] || null;
