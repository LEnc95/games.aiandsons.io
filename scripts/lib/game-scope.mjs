// Reject misspelled/missing scopes before any generator writes files.
export function parseGameScope(args) {
  if (args.length === 0) return {};
  if (args.length !== 2 || args[0] !== '--slug' || !args[1] || args[1].startsWith('-')) {
    throw new Error('Usage: --slug <registered-game-slug> (or no arguments for all games)');
  }
  return { slug: args[1] };
}

export function selectGame(games, slug) {
  const game = games.find((entry) => entry.slug === slug);
  if (!game) throw new Error(`Unknown game slug: ${slug}`);
  return game;
}
