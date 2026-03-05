import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SHOP_PATH = path.join(ROOT, 'shop.html');
const COSMETICS_PATH = path.join(ROOT, 'src/prog/cosmetics.js');

const GAME_FILE_BY_PREFIX = {
  tictactoe: 'tictactoe/index.html',
  rps: 'rps/index.html',
  memory: 'memory/index.html',
  breakout: 'breakout/index.html',
  connect4: 'connect4/index.html',
  minesweeper: 'minesweeper/index.html',
  flappy: 'flappy/index.html',
  dino: 'dino/index.html',
  spaceinvaders: 'spaceinvaders/index.html',
  frogger: 'frogger/index.html',
  ski: 'ski/index.html',
  '2048': '2048/index.html',
  tetris: 'tetris/index.html',
  asteroids: 'asteroids/index.html',
  bomberman: 'bomberman/index.html',
};

function extractItems(shopHtml) {
  const itemsBlockMatch = shopHtml.match(/const items = \[(.*?)\n\s*\];/s);
  assert.ok(itemsBlockMatch, 'Could not find `const items = [...]` block in shop.html');

  const block = itemsBlockMatch[1];
  const objectMatches = block.matchAll(/\{\s*id:\s*"(?<id>[^"]+)"(?<rest>[\s\S]*?)\},/g);

  const items = [];
  for (const match of objectMatches) {
    const rest = match.groups.rest;
    const type = rest.match(/type:\s*"(?<type>[^"]+)"/)?.groups?.type;
    const category = rest.match(/category:\s*"(?<category>[^"]+)"/)?.groups?.category;
    const value = rest.match(/value:\s*"(?<value>[^"]+)"/)?.groups?.value;

    items.push({
      id: match.groups.id,
      type,
      category,
      value,
    });
  }

  return items;
}

function gatherTextFiles(dir) {
  const out = [];
  const stack = [dir];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }

      if (/\.(html|js|json|md)$/i.test(entry.name)) {
        out.push(full);
      }
    }
  }

  return out;
}

const shopHtml = fs.readFileSync(SHOP_PATH, 'utf8');
const cosmeticsSource = fs.readFileSync(COSMETICS_PATH, 'utf8');
const allProjectTexts = new Map(
  gatherTextFiles(ROOT)
    .filter((file) => !file.endsWith('shop.html'))
    .map((file) => [file, fs.readFileSync(file, 'utf8')]),
);
const items = extractItems(shopHtml);


test('shop item IDs are unique', () => {
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate shop item id(s) found.');
});

test('every cosmetic item has a style handler in cosmetics logic', () => {
  const unsupported = items
    .filter((item) => item.type === 'cosmetic')
    .filter((item) => !cosmeticsSource.includes(`case '${item.value}':`));

  assert.deepEqual(
    unsupported,
    [],
    `Cosmetic items missing style mappings in src/prog/cosmetics.js: ${unsupported.map((x) => x.id).join(', ')}`,
  );
});

test('every inventory item has a known game-prefix mapping', () => {
  const unknown = [];

  for (const item of items.filter((x) => x.type === 'inventory')) {
    const [prefix] = item.id.split('-');
    const gameFile = GAME_FILE_BY_PREFIX[prefix];

    if (!gameFile) {
      unknown.push(item.id);
      continue;
    }

    const gamePath = path.join(ROOT, gameFile);
    const gameSource = allProjectTexts.get(gamePath);
    assert.ok(gameSource, `Expected game file does not exist or is unreadable: ${gameFile}`);
  }

  assert.deepEqual(
    unknown,
    [],
    `Inventory shop items with unknown game prefixes: ${unknown.join(', ')}`,
  );
});
