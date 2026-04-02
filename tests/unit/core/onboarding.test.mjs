import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOnboardingState, DEFAULT_ONBOARDING_STATE } from '../../../src/core/onboarding.js';

test('normalizeOnboardingState', async (t) => {
  await t.test('handles null, undefined, and non-object inputs', () => {
    assert.deepEqual(normalizeOnboardingState(null), DEFAULT_ONBOARDING_STATE);
    assert.deepEqual(normalizeOnboardingState(undefined), DEFAULT_ONBOARDING_STATE);
    assert.deepEqual(normalizeOnboardingState('string'), DEFAULT_ONBOARDING_STATE);
    assert.deepEqual(normalizeOnboardingState(123), DEFAULT_ONBOARDING_STATE);
    assert.deepEqual(normalizeOnboardingState(true), DEFAULT_ONBOARDING_STATE);
  });

  await t.test('handles empty object input', () => {
    assert.deepEqual(normalizeOnboardingState({}), DEFAULT_ONBOARDING_STATE);
  });

  await t.test('correctly maps valid complete states', () => {
    const validParentState = {
      skipped: true,
      selectedRole: 'parent',
      updatedAt: 1600000000,
    };
    assert.deepEqual(normalizeOnboardingState(validParentState), validParentState);

    const validTeacherState = {
      skipped: false,
      selectedRole: 'teacher',
      updatedAt: 1700000000,
    };
    assert.deepEqual(normalizeOnboardingState(validTeacherState), validTeacherState);
  });

  await t.test('trims and lowercases selectedRole', () => {
    assert.deepEqual(normalizeOnboardingState({ selectedRole: '  PARENT  ' }), {
      skipped: false,
      selectedRole: 'parent',
      updatedAt: 0,
    });
    assert.deepEqual(normalizeOnboardingState({ selectedRole: 'Teacher' }), {
      skipped: false,
      selectedRole: 'teacher',
      updatedAt: 0,
    });
  });

  await t.test('defaults to empty string for invalid roles', () => {
    assert.deepEqual(normalizeOnboardingState({ selectedRole: 'student' }), DEFAULT_ONBOARDING_STATE);
    assert.deepEqual(normalizeOnboardingState({ selectedRole: 123 }), DEFAULT_ONBOARDING_STATE);
    assert.deepEqual(normalizeOnboardingState({ selectedRole: {} }), DEFAULT_ONBOARDING_STATE);
    assert.deepEqual(normalizeOnboardingState({ selectedRole: null }), DEFAULT_ONBOARDING_STATE);
  });

  await t.test('casts skipped to boolean', () => {
    assert.deepEqual(normalizeOnboardingState({ skipped: 1 }), {
      skipped: true,
      selectedRole: '',
      updatedAt: 0,
    });
    assert.deepEqual(normalizeOnboardingState({ skipped: 'true' }), {
      skipped: true,
      selectedRole: '',
      updatedAt: 0,
    });
    assert.deepEqual(normalizeOnboardingState({ skipped: '' }), {
      skipped: false,
      selectedRole: '',
      updatedAt: 0,
    });
    assert.deepEqual(normalizeOnboardingState({ skipped: null }), {
      skipped: false,
      selectedRole: '',
      updatedAt: 0,
    });
  });

  await t.test('handles updatedAt correctly', () => {
    // valid positive integer
    assert.deepEqual(normalizeOnboardingState({ updatedAt: 100 }), {
      skipped: false,
      selectedRole: '',
      updatedAt: 100,
    });
    // negative becomes 0
    assert.deepEqual(normalizeOnboardingState({ updatedAt: -100 }), {
      skipped: false,
      selectedRole: '',
      updatedAt: 0,
    });
    // decimal gets floored
    assert.deepEqual(normalizeOnboardingState({ updatedAt: 100.5 }), {
      skipped: false,
      selectedRole: '',
      updatedAt: 100,
    });
    // non-finite, string, null etc. become 0
    assert.deepEqual(normalizeOnboardingState({ updatedAt: '100' }), {
      skipped: false,
      selectedRole: '',
      updatedAt: 0,
    });
    assert.deepEqual(normalizeOnboardingState({ updatedAt: NaN }), {
      skipped: false,
      selectedRole: '',
      updatedAt: 0,
    });
    assert.deepEqual(normalizeOnboardingState({ updatedAt: Infinity }), {
      skipped: false,
      selectedRole: '',
      updatedAt: 0,
    });
  });
});
