import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENTITLEMENT_KEYS,
  DEFAULT_ENTITLEMENTS,
  normalizeEntitlements,
  hasEntitlement,
  isPremiumShopItem,
  getRequiredEntitlementForShopItem,
  isShopItemLockedByEntitlement,
} from '../src/core/entitlements.js';

test('normalizeEntitlements returns predictable boolean flags', () => {
  const normalized = normalizeEntitlements({
    familyPremium: 1,
    schoolLicense: '',
  });

  assert.deepEqual(
    normalized,
    {
      familyPremium: true,
      schoolLicense: false,
    },
  );
});

test('premium shop items map to family premium entitlement', () => {
  const premiumItem = { id: 'paddle-void' };
  const freeItem = { id: 'paddle-sky' };

  assert.equal(isPremiumShopItem(premiumItem), true);
  assert.equal(isPremiumShopItem(freeItem), false);
  assert.equal(getRequiredEntitlementForShopItem(premiumItem), ENTITLEMENT_KEYS.FAMILY_PREMIUM);
  assert.equal(getRequiredEntitlementForShopItem(freeItem), null);
});

test('isShopItemLockedByEntitlement enforces premium gate only when entitlement is missing', () => {
  const premiumItem = { id: 'tetris-aurora-stack' };
  const freeEntitlements = { ...DEFAULT_ENTITLEMENTS, familyPremium: false };
  const premiumEntitlements = { ...DEFAULT_ENTITLEMENTS, familyPremium: true };

  assert.equal(isShopItemLockedByEntitlement(premiumItem, freeEntitlements), true);
  assert.equal(isShopItemLockedByEntitlement(premiumItem, premiumEntitlements), false);
  assert.equal(isShopItemLockedByEntitlement({ id: 'tetris-neon-grid' }, freeEntitlements), false);
});

test('hasEntitlement reads keys from normalized entitlement objects', () => {
  const entitlements = normalizeEntitlements({ familyPremium: true, schoolLicense: false });
  assert.equal(hasEntitlement(ENTITLEMENT_KEYS.FAMILY_PREMIUM, entitlements), true);
  assert.equal(hasEntitlement(ENTITLEMENT_KEYS.SCHOOL_LICENSE, entitlements), false);
});
