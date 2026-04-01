import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { get } from '../../src/core/storage.js';

const NAMESPACE = 'cadegames:v1';

test('get() function', async (t) => {
  let originalLocalStorage;

  t.beforeEach(() => {
    originalLocalStorage = global.localStorage;
    global.localStorage = {
      getItem: mock.fn(),
    };
  });

  t.afterEach(() => {
    global.localStorage = originalLocalStorage;
  });

  await t.test('returns parsed JSON for valid stored string', () => {
    global.localStorage.getItem.mock.mockImplementation(() => '{"testKey":"testValue"}');

    const result = get('mykey');

    assert.deepEqual(result, { testKey: 'testValue' });
    assert.equal(global.localStorage.getItem.mock.calls.length, 1);
    assert.equal(global.localStorage.getItem.mock.calls[0].arguments[0], `${NAMESPACE}:mykey`);
  });

  await t.test('returns default fallback (null) when stored item is null', () => {
    global.localStorage.getItem.mock.mockImplementation(() => null);

    const result = get('mykey');

    assert.equal(result, null);
  });

  await t.test('returns custom fallback when stored item is null', () => {
    global.localStorage.getItem.mock.mockImplementation(() => null);

    const fallback = { a: 1 };
    const result = get('mykey', fallback);

    assert.deepEqual(result, fallback);
  });

  await t.test('returns default fallback (null) for invalid JSON', () => {
    global.localStorage.getItem.mock.mockImplementation(() => 'invalid json string');

    const result = get('mykey');

    assert.equal(result, null);
  });

  await t.test('returns custom fallback for invalid JSON', () => {
    global.localStorage.getItem.mock.mockImplementation(() => '{invalid_json}');

    const fallback = 'fallbackValue';
    const result = get('mykey', fallback);

    assert.equal(result, fallback);
  });

  await t.test('returns default fallback (null) if localStorage throws an error', () => {
    global.localStorage.getItem.mock.mockImplementation(() => { throw new Error('localStorage error'); });

    const result = get('mykey');

    assert.equal(result, null);
  });
});
