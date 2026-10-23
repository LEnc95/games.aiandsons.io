import { GAMES } from '../src/meta/games.js';
import { parseGameScope, selectGame } from './lib/game-scope.mjs';
import { generateSitemap } from './generate-sitemap.mjs';
import { injectAllSeo } from './inject-seo.mjs';
import { generateDiscoveryMetadata } from './generate-discovery-metadata.mjs';

const scope = parseGameScope(process.argv.slice(2));
if (scope.slug) selectGame(GAMES, scope.slug);
generateSitemap();
injectAllSeo(scope);
generateDiscoveryMetadata();
