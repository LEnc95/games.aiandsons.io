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
  aquariumlogic: Object.freeze({
    releasedAt: '2026-07-23',
    outcomes: Object.freeze({
      boards: Object.freeze({ min: 1, max: 5, direction: 'higher' }),
      filled: Object.freeze({ min: 0, max: 36, direction: 'higher' }),
      air: Object.freeze({ min: 0, max: 3, direction: 'higher' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'tank-theme', kind: 'palette', tokens: Object.freeze(['water', 'glass', 'sand', 'accent']) }),
    ]),
  }),
  morrismeadow: Object.freeze({
    releasedAt: '2026-07-24',
    outcomes: Object.freeze({
      mills: Object.freeze({ min: 0, max: 50, direction: 'higher' }),
      captures: Object.freeze({ min: 0, max: 9, direction: 'higher' }),
      turns: Object.freeze({ min: 0, max: 500, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'board-theme', kind: 'palette', tokens: Object.freeze(['background', 'lines', 'player', 'rival', 'accent']) }),
    ]),
  }),
  reboundrelay: Object.freeze({
    releasedAt: '2026-07-25',
    outcomes: Object.freeze({
      beacons: Object.freeze({ min: 0, max: 15, direction: 'higher' }),
      relays: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      moves: Object.freeze({ min: 0, max: 80, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'circuit-theme', kind: 'palette', tokens: Object.freeze(['background', 'grid', 'wall', 'bot', 'beacon', 'trail']) }),
    ]),
  }),
  meteorminer: Object.freeze({
    releasedAt: '2026-07-25',
    outcomes: Object.freeze({
      score: Object.freeze({ min: 0, max: 100000, direction: 'higher' }),
      ore: Object.freeze({ min: 0, max: 27, direction: 'higher' }),
      sectors: Object.freeze({ min: 0, max: 3, direction: 'higher' }),
      hull: Object.freeze({ min: 0, max: 100, direction: 'higher' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'drone-theme', kind: 'palette', tokens: Object.freeze(['hull', 'engine', 'shield', 'ore']) }),
    ]),
  }),
  rippleshepherd: Object.freeze({
    releasedAt: '2026-07-26',
    outcomes: Object.freeze({
      fireflies: Object.freeze({ min: 0, max: 20, direction: 'higher' }),
      ponds: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      ripples: Object.freeze({ min: 0, max: 100, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'pond-theme', kind: 'palette', tokens: Object.freeze(['sky', 'water', 'rim', 'ripple', 'lily', 'stone']) }),
    ]),
  }),
  pollenpatrol: Object.freeze({
    releasedAt: '2026-07-27',
    outcomes: Object.freeze({
      flowers: Object.freeze({ min: 0, max: 25, direction: 'higher' }),
      gardens: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      moves: Object.freeze({ min: 0, max: 200, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'garden-theme', kind: 'palette', tokens: Object.freeze(['background', 'ground', 'hedge', 'flower', 'bee', 'beetle', 'trail']) }),
    ]),
  }),
  starwheel: Object.freeze({
    releasedAt: '2026-07-28',
    outcomes: Object.freeze({
      rings: Object.freeze({ min: 0, max: 25, direction: 'higher' }),
      locks: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      turns: Object.freeze({ min: 0, max: 120, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'dial-theme', kind: 'palette', tokens: Object.freeze(['background', 'ring', 'gate', 'glyph', 'core', 'beam']) }),
    ]),
  }),
  firebreakcommand: Object.freeze({
    releasedAt: '2026-07-29',
    outcomes: Object.freeze({
      cabins: Object.freeze({ min: 0, max: 20, direction: 'higher' }),
      zones: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      firelines: Object.freeze({ min: 0, max: 30, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'terrain-theme', kind: 'palette', tokens: Object.freeze(['sky', 'ground', 'forest', 'water', 'rock', 'fireline', 'fire', 'cabin']) }),
    ]),
  }),
  sumshade: Object.freeze({
    releasedAt: '2026-07-30',
    outcomes: Object.freeze({
      tiles: Object.freeze({ min: 0, max: 100, direction: 'higher' }),
      boards: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      checks: Object.freeze({ min: 0, max: 30, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'paper-theme', kind: 'palette', tokens: Object.freeze(['background', 'board', 'shaded', 'cross', 'clue', 'cursor']) }),
    ]),
  }),
  lanternwake: Object.freeze({
    releasedAt: '2026-07-31',
    outcomes: Object.freeze({
      lanterns: Object.freeze({ min: 0, max: 30, direction: 'higher' }),
      crossings: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      collisions: Object.freeze({ min: 0, max: 15, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'wake-theme', kind: 'palette', tokens: Object.freeze(['sky', 'water', 'bank', 'foam', 'lantern', 'hull', 'trim', 'driftwood']) }),
    ]),
  }),
  acornascent: Object.freeze({
    releasedAt: '2026-08-01',
    outcomes: Object.freeze({
      acorns: Object.freeze({ min: 0, max: 25, direction: 'higher' }),
      groves: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      leaps: Object.freeze({ min: 0, max: 100, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'canopy-theme', kind: 'palette', tokens: Object.freeze(['sky', 'leaf', 'leaf2', 'wood', 'squirrel', 'acorn', 'nest', 'trail']) }),
    ]),
  }),
});

export const getGameContentContract = (slug) => GAME_CONTENT_CONTRACTS[String(slug || '').trim()] || null;
