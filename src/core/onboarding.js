import { get, set } from './storage.js';

export const ONBOARDING_ROLES = Object.freeze(['', 'parent', 'teacher']);

export const DEFAULT_ONBOARDING_STATE = Object.freeze({
  skipped: false,
  selectedRole: '',
  updatedAt: 0,
});

export const normalizeOnboardingState = (source) => {
  const raw = source && typeof source === 'object' ? source : {};
  const selectedRoleRaw = typeof raw.selectedRole === 'string' ? raw.selectedRole.trim().toLowerCase() : '';
  const selectedRole = ONBOARDING_ROLES.includes(selectedRoleRaw) ? selectedRoleRaw : '';
  return {
    skipped: Boolean(raw.skipped),
    selectedRole,
    updatedAt: Number.isFinite(raw.updatedAt) ? Math.max(0, Math.floor(raw.updatedAt)) : 0,
  };
};

export const getOnboardingState = () => {
  return normalizeOnboardingState(get('onboarding', DEFAULT_ONBOARDING_STATE));
};

export const setOnboardingState = (patch) => {
  const next = normalizeOnboardingState({
    ...getOnboardingState(),
    ...(patch && typeof patch === 'object' ? patch : {}),
    updatedAt: Date.now(),
  });
  set('onboarding', next);
  return next;
};

export const skipOnboarding = () => {
  return setOnboardingState({ skipped: true });
};

export const selectOnboardingRole = (role) => {
  const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
  if (!ONBOARDING_ROLES.includes(normalizedRole) || !normalizedRole) return getOnboardingState();
  return setOnboardingState({ skipped: false, selectedRole: normalizedRole });
};
