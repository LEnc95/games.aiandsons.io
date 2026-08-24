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
  moonscale: Object.freeze({
    releasedAt: '2026-08-02',
    outcomes: Object.freeze({
      moonstones: Object.freeze({ min: 0, max: 40, direction: 'higher' }),
      skies: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      checks: Object.freeze({ min: 0, max: 30, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'scale-theme', kind: 'palette', tokens: Object.freeze(['sky', 'horizon', 'beam', 'stand', 'moonstone', 'glow', 'accent']) }),
    ]),
  }),
  shadowbloom: Object.freeze({
    releasedAt: '2026-08-03',
    outcomes: Object.freeze({
      blooms: Object.freeze({ min: 0, max: 40, direction: 'higher' }),
      gardens: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      casts: Object.freeze({ min: 0, max: 200, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'garden-theme', kind: 'palette', tokens: Object.freeze(['sky', 'ground', 'grid', 'shadow', 'stone', 'nightBloom', 'sunBloom', 'accent']) }),
    ]),
  }),
  quiltquest: Object.freeze({
    releasedAt: '2026-08-04',
    outcomes: Object.freeze({
      patches: Object.freeze({ min: 0, max: 30, direction: 'higher' }),
      panels: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      placements: Object.freeze({ min: 0, max: 300, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'quilt-theme', kind: 'palette', tokens: Object.freeze(['background', 'cloth', 'grid', 'patches', 'stitch', 'accent']) }),
    ]),
  }),
  riverriddle: Object.freeze({
    releasedAt: '2026-08-05',
    outcomes: Object.freeze({
      travelers: Object.freeze({ min: 0, max: 25, direction: 'higher' }),
      rivers: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      voyages: Object.freeze({ min: 0, max: 200, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'river-theme', kind: 'palette', tokens: Object.freeze(['background', 'sky', 'water', 'banks', 'boat', 'cards', 'accent']) }),
    ]),
  }),
  choruscurrent: Object.freeze({
    releasedAt: '2026-08-06',
    outcomes: Object.freeze({
      waves: Object.freeze({ min: 0, max: 15, direction: 'higher' }),
      harbors: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      adjustments: Object.freeze({ min: 0, max: 500, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'harbor-theme', kind: 'palette', tokens: Object.freeze(['background', 'sky', 'horizon', 'water', 'panel', 'grid', 'current', 'beacon', 'accent']) }),
    ]),
  }),
  kiteparade: Object.freeze({
    releasedAt: '2026-08-07',
    outcomes: Object.freeze({
      patches: Object.freeze({ min: 0, max: 40, direction: 'higher' }),
      kites: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      checks: Object.freeze({ min: 0, max: 15, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'kite-theme', kind: 'palette', tokens: Object.freeze(['sky', 'cloud', 'hills', 'kite', 'seam', 'tail', 'dyes', 'accent']) }),
    ]),
  }),
  shellshift: Object.freeze({
    releasedAt: '2026-08-08',
    outcomes: Object.freeze({
      shells: Object.freeze({ min: 0, max: 124, direction: 'higher' }),
      tidepools: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      shifts: Object.freeze({ min: 0, max: 500, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'shell-theme', kind: 'palette', tokens: Object.freeze(['background', 'water', 'sand', 'tray', 'shells', 'accent']) }),
    ]),
  }),
  flockfold: Object.freeze({
    releasedAt: '2026-08-09',
    outcomes: Object.freeze({
      gates: Object.freeze({ min: 0, max: 25, direction: 'higher' }),
      skies: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      folds: Object.freeze({ min: 0, max: 500, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'flock-theme', kind: 'palette', tokens: Object.freeze(['sky', 'horizon', 'cloud', 'gate', 'birds', 'trail', 'accent']) }),
    ]),
  }),
  baseballradio: Object.freeze({
    releasedAt: '2026-08-10',
    outcomes: Object.freeze({
      wins: Object.freeze({ min: 0, max: 1, direction: 'higher' }),
      runs: Object.freeze({ min: 0, max: 100, direction: 'higher' }),
      opponentRuns: Object.freeze({ min: 0, max: 100, direction: 'lower' }),
      innings: Object.freeze({ min: 3, max: 30, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'broadcast-theme', kind: 'palette', tokens: Object.freeze(['background', 'panel', 'accent', 'score', 'warning']) }),
    ]),
  }),
  geargrove: Object.freeze({
    releasedAt: '2026-08-10',
    outcomes: Object.freeze({
      gears: Object.freeze({ min: 0, max: 27, direction: 'higher' }),
      groves: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      turns: Object.freeze({ min: 0, max: 500, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'gear-theme', kind: 'palette', tokens: Object.freeze(['sky', 'ground', 'leaf', 'edge', 'gear', 'teeth', 'target', 'accent']) }),
    ]),
  }),
  nectarmeasure: Object.freeze({
    releasedAt: '2026-08-11',
    outcomes: Object.freeze({
      vessels: Object.freeze({ min: 0, max: 18, direction: 'higher' }),
      hives: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      pours: Object.freeze({ min: 0, max: 1000, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'nectar-theme', kind: 'palette', tokens: Object.freeze(['sky', 'sky2', 'ground', 'hill', 'panel', 'edge', 'nectar', 'nectar2', 'target', 'accent', 'ink']) }),
    ]),
  }),
  glassgarden: Object.freeze({
    releasedAt: '2026-08-12',
    outcomes: Object.freeze({
      panes: Object.freeze({ min: 0, max: 43, direction: 'higher' }),
      windows: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      turns: Object.freeze({ min: 0, max: 1000, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'glass-theme', kind: 'palette', tokens: Object.freeze(['wall', 'frame', 'lead', 'glass', 'glow', 'accent']) }),
    ]),
  }),
  dapplegrove: Object.freeze({
    releasedAt: '2026-08-13',
    outcomes: Object.freeze({
      leaves: Object.freeze({ min: 0, max: 107, direction: 'higher' }),
      groves: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      marks: Object.freeze({ min: 0, max: 1000, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'grove-theme', kind: 'palette', tokens: Object.freeze(['sky', 'ground', 'trunk', 'bark', 'panel', 'leaf', 'leaf2', 'shade', 'sun', 'accent']) }),
    ]),
  }),
  fireflyslants: Object.freeze({
    releasedAt: '2026-08-14',
    outcomes: Object.freeze({
      trails: Object.freeze({ min: 0, max: 127, direction: 'higher' }),
      clearings: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      strokes: Object.freeze({ min: 0, max: 1000, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'firefly-theme', kind: 'palette', tokens: Object.freeze(['sky', 'ground', 'hill', 'panel', 'grid', 'trail', 'glow', 'knot', 'accent']) }),
    ]),
  }),
  magnetmeadow: Object.freeze({
    releasedAt: '2026-08-15',
    outcomes: Object.freeze({
      magnets: Object.freeze({ min: 0, max: 40, direction: 'higher' }),
      meadows: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      flips: Object.freeze({ min: 0, max: 1000, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'magnet-theme', kind: 'palette', tokens: Object.freeze(['sky', 'sky2', 'ground', 'hill', 'panel', 'grid', 'plus', 'minus', 'grass', 'accent']) }),
    ]),
  }),
  rainkeeper: Object.freeze({
    releasedAt: '2026-08-16',
    outcomes: Object.freeze({
      raindrops: Object.freeze({ min: 0, max: 60, direction: 'higher' }),
      gardens: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      hailHits: Object.freeze({ min: 0, max: 3, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'rain-theme', kind: 'palette', tokens: Object.freeze(['sky', 'sky2', 'cloud', 'ground', 'water', 'umbrella', 'hail', 'flower', 'accent']) }),
    ]),
  }),
  harborharmony: Object.freeze({
    releasedAt: '2026-08-22',
    outcomes: Object.freeze({
      beacons: Object.freeze({ min: 0, max: 45, direction: 'higher' }),
      harbors: Object.freeze({ min: 0, max: 5, direction: 'higher' }),
      misfires: Object.freeze({ min: 0, max: 3, direction: 'lower' }),
    }),
    cosmeticSlots: Object.freeze([
      Object.freeze({ key: 'harbor-theme', kind: 'palette', tokens: Object.freeze(['sky', 'sea', 'dock', 'boat', 'signal', 'accent']) }),
    ]),
  }),
  lanternloom: Object.freeze({ releasedAt: '2026-08-21', outcomes: Object.freeze({ stars: Object.freeze({ min: 0, max: 55, direction: 'higher' }), nights: Object.freeze({ min: 0, max: 5, direction: 'higher' }), misses: Object.freeze({ min: 0, max: 3, direction: 'lower' }) }), cosmeticSlots: Object.freeze([Object.freeze({ key: 'lantern-theme', kind: 'palette', tokens: Object.freeze(['sky', 'halo', 'beam', 'lantern']) })]) }),
  tideglass: Object.freeze({ releasedAt: '2026-08-23', outcomes: Object.freeze({ shells: Object.freeze({ min: 0, max: 25, direction: 'higher' }), trails: Object.freeze({ min: 0, max: 5, direction: 'higher' }), cracks: Object.freeze({ min: 0, max: 3, direction: 'lower' }) }), cosmeticSlots: Object.freeze([Object.freeze({ key: 'tideglass-theme', kind: 'palette', tokens: Object.freeze(['sky', 'water', 'sand', 'path', 'accent']) })]) }),
  auroraaccord: Object.freeze({ releasedAt: '2026-08-24', outcomes: Object.freeze({ notes: Object.freeze({ min: 0, max: 25, direction: 'higher' }), accords: Object.freeze({ min: 0, max: 5, direction: 'higher' }), misses: Object.freeze({ min: 0, max: 3, direction: 'lower' }) }), cosmeticSlots: Object.freeze([Object.freeze({ key: 'aurora-theme', kind: 'palette', tokens: Object.freeze(['sky', 'horizon', 'lane', 'note', 'beam', 'accent']) })]) }),
});

export const getGameContentContract = (slug) => GAME_CONTENT_CONTRACTS[String(slug || '').trim()] || null;
