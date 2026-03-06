import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENTITLEMENT_KEYS,
  DEFAULT_ENTITLEMENTS,
  normalizeEntitlements,
  normalizeSchoolLicenseRequest,
  SCHOOL_LICENSE_REQUEST_STATUSES,
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
      checkout: {
        status: 'idle',
        planId: '',
        token: '',
        startedAt: 0,
        completedAt: 0,
      },
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

test('normalizeSchoolLicenseRequest enforces safe shape and valid statuses', () => {
  const normalized = normalizeSchoolLicenseRequest({
    status: 'pending_review',
    requestId: 'sl_demo',
    schoolName: 'Elm Street School',
    districtEmail: 'ADMIN@DISTRICT.ORG',
    seats: 42.7,
  });

  assert.deepEqual(
    normalized,
    {
      status: 'pending_review',
      requestId: 'sl_demo',
      planId: '',
      schoolName: 'Elm Street School',
      districtEmail: 'admin@district.org',
      seats: 42,
      submittedAt: 0,
      approvedAt: 0,
    },
  );
});

test('normalizeSchoolLicenseRequest falls back to idle for unknown statuses', () => {
  const normalized = normalizeSchoolLicenseRequest({
    status: 'unknown_state',
    requestId: 'abc',
  });

  assert.equal(normalized.status, SCHOOL_LICENSE_REQUEST_STATUSES.IDLE);
  assert.equal(normalized.requestId, 'abc');
});
