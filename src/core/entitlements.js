import { get, set } from './storage.js';

export const ENTITLEMENT_KEYS = Object.freeze({
  FAMILY_PREMIUM: 'familyPremium',
  SCHOOL_LICENSE: 'schoolLicense',
});

export const DEFAULT_ENTITLEMENTS = Object.freeze({
  [ENTITLEMENT_KEYS.FAMILY_PREMIUM]: false,
  [ENTITLEMENT_KEYS.SCHOOL_LICENSE]: false,
  checkout: {
    status: 'idle',
    planId: '',
    token: '',
    startedAt: 0,
    completedAt: 0,
  },
});

export const SCHOOL_LICENSE_REQUEST_STATUSES = Object.freeze({
  IDLE: 'idle',
  PENDING_REVIEW: 'pending_review',
  ACTIVE: 'active',
});

export const DEFAULT_SCHOOL_LICENSE_REQUEST = Object.freeze({
  status: SCHOOL_LICENSE_REQUEST_STATUSES.IDLE,
  requestId: '',
  planId: '',
  schoolName: '',
  districtEmail: '',
  seats: 0,
  submittedAt: 0,
  approvedAt: 0,
});

const PREMIUM_SHOP_ITEM_ID_LIST = Object.freeze([
  'paddle-gold',
  'paddle-void',
  'snake-cosmic',
  'snake-glacier',
  'mario-gold',
  'mario-galaxy',
  'ski-gold-skier',
  'spaceinvaders-omega',
  'frogger-neon-rain',
  'tetris-aurora-stack',
  'asteroids-nebula-drift',
  'bomberman-jade-maze',
]);

const PREMIUM_SHOP_ITEM_IDS = new Set(PREMIUM_SHOP_ITEM_ID_LIST);

const SCHOOL_LICENSE_REQUEST_STORAGE_KEY = 'schoolLicenseRequest';
const MAX_SCHOOL_LICENSE_SEATS = 100000;

export const normalizeEntitlements = (source) => {
  const raw = source && typeof source === 'object' ? source : {};
  const rawCheckout = raw.checkout && typeof raw.checkout === 'object' ? raw.checkout : {};
  const statusRaw = typeof rawCheckout.status === 'string' ? rawCheckout.status.trim().toLowerCase() : 'idle';
  const status = statusRaw === 'pending' || statusRaw === 'active' ? statusRaw : 'idle';
  const token = typeof rawCheckout.token === 'string' ? rawCheckout.token.trim() : '';
  const planId = typeof rawCheckout.planId === 'string' ? rawCheckout.planId.trim() : '';
  return {
    [ENTITLEMENT_KEYS.FAMILY_PREMIUM]: Boolean(raw[ENTITLEMENT_KEYS.FAMILY_PREMIUM]),
    [ENTITLEMENT_KEYS.SCHOOL_LICENSE]: Boolean(raw[ENTITLEMENT_KEYS.SCHOOL_LICENSE]),
    checkout: {
      status,
      planId,
      token,
      startedAt: Number.isFinite(rawCheckout.startedAt) ? Math.max(0, Math.floor(rawCheckout.startedAt)) : 0,
      completedAt: Number.isFinite(rawCheckout.completedAt) ? Math.max(0, Math.floor(rawCheckout.completedAt)) : 0,
    },
  };
};

export const getEntitlements = () => {
  return normalizeEntitlements(get('entitlements', DEFAULT_ENTITLEMENTS));
};

export const setEntitlements = (patch) => {
  const next = normalizeEntitlements({
    ...getEntitlements(),
    ...(patch && typeof patch === 'object' ? patch : {}),
  });
  set('entitlements', next);
  return next;
};

export const hasEntitlement = (key, entitlements = getEntitlements()) => {
  if (typeof key !== 'string' || !key.trim()) return false;
  return Boolean(entitlements && entitlements[key]);
};

export const getCheckoutState = (entitlements = getEntitlements()) => {
  const normalized = normalizeEntitlements(entitlements);
  return { ...normalized.checkout };
};

const randomToken = () => {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return `co_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    }
  } catch {
    // Fallback below.
  }
  const seed = `${Date.now()}_${Math.random().toString(16).slice(2)}_${Math.random().toString(16).slice(2)}`;
  return `co_${seed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
};

export const createCheckoutIntent = (planId) => {
  const nextPlanId = typeof planId === 'string' ? planId.trim() : '';
  if (!nextPlanId) return null;
  const entitlements = getEntitlements();
  const checkout = {
    status: 'pending',
    planId: nextPlanId,
    token: randomToken(),
    startedAt: Date.now(),
    completedAt: 0,
  };
  return setEntitlements({ ...entitlements, checkout });
};

export const completeCheckoutIntent = (token) => {
  const providedToken = typeof token === 'string' ? token.trim() : '';
  if (!providedToken) return null;

  const entitlements = getEntitlements();
  const checkout = getCheckoutState(entitlements);
  if (checkout.status !== 'pending' || checkout.token !== providedToken) {
    return null;
  }

  return setEntitlements({
    ...entitlements,
    [ENTITLEMENT_KEYS.FAMILY_PREMIUM]: true,
    checkout: {
      ...checkout,
      status: 'active',
      completedAt: Date.now(),
    },
  });
};

export const clearCheckoutIntent = () => {
  const entitlements = getEntitlements();
  return setEntitlements({
    ...entitlements,
    checkout: {
      status: 'idle',
      planId: '',
      token: '',
      startedAt: 0,
      completedAt: 0,
    },
  });
};

const sanitizeText = (value, maxLength = 120) => {
  return String(value || '').trim().slice(0, maxLength);
};

const normalizeSeatCount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(MAX_SCHOOL_LICENSE_SEATS, Math.floor(numeric)));
};

const isLikelyEmail = (value) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const schoolRequestId = () => {
  return randomToken().replace(/^co_/, 'sl_');
};

export const normalizeSchoolLicenseRequest = (source) => {
  const raw = source && typeof source === 'object' ? source : {};
  const rawStatus = typeof raw.status === 'string' ? raw.status.trim().toLowerCase() : SCHOOL_LICENSE_REQUEST_STATUSES.IDLE;
  const status = Object.values(SCHOOL_LICENSE_REQUEST_STATUSES).includes(rawStatus)
    ? rawStatus
    : SCHOOL_LICENSE_REQUEST_STATUSES.IDLE;
  return {
    status,
    requestId: sanitizeText(raw.requestId, 64),
    planId: sanitizeText(raw.planId, 64),
    schoolName: sanitizeText(raw.schoolName, 120),
    districtEmail: sanitizeText(raw.districtEmail, 160).toLowerCase(),
    seats: normalizeSeatCount(raw.seats),
    submittedAt: Number.isFinite(raw.submittedAt) ? Math.max(0, Math.floor(raw.submittedAt)) : 0,
    approvedAt: Number.isFinite(raw.approvedAt) ? Math.max(0, Math.floor(raw.approvedAt)) : 0,
  };
};

export const getSchoolLicenseRequest = () => {
  return normalizeSchoolLicenseRequest(get(SCHOOL_LICENSE_REQUEST_STORAGE_KEY, DEFAULT_SCHOOL_LICENSE_REQUEST));
};

const setSchoolLicenseRequest = (nextValue) => {
  const normalized = normalizeSchoolLicenseRequest(nextValue);
  set(SCHOOL_LICENSE_REQUEST_STORAGE_KEY, normalized);
  return normalized;
};

export const submitSchoolLicenseRequest = ({ planId, schoolName, districtEmail, seats } = {}) => {
  const nextPlanId = sanitizeText(planId, 64);
  const nextSchoolName = sanitizeText(schoolName, 120);
  const nextDistrictEmail = sanitizeText(districtEmail, 160).toLowerCase();
  const nextSeats = normalizeSeatCount(seats);
  if (!nextPlanId || !nextSchoolName || !isLikelyEmail(nextDistrictEmail) || nextSeats < 1) {
    return null;
  }

  const request = setSchoolLicenseRequest({
    status: SCHOOL_LICENSE_REQUEST_STATUSES.PENDING_REVIEW,
    requestId: schoolRequestId(),
    planId: nextPlanId,
    schoolName: nextSchoolName,
    districtEmail: nextDistrictEmail,
    seats: nextSeats,
    submittedAt: Date.now(),
    approvedAt: 0,
  });

  setEntitlements({
    ...getEntitlements(),
    [ENTITLEMENT_KEYS.SCHOOL_LICENSE]: false,
  });

  return request;
};

export const activateSchoolLicenseFromRequest = (requestId) => {
  const token = sanitizeText(requestId, 64);
  if (!token) return null;
  const current = getSchoolLicenseRequest();
  if (
    current.status !== SCHOOL_LICENSE_REQUEST_STATUSES.PENDING_REVIEW
    || current.requestId !== token
  ) {
    return null;
  }

  const request = setSchoolLicenseRequest({
    ...current,
    status: SCHOOL_LICENSE_REQUEST_STATUSES.ACTIVE,
    approvedAt: Date.now(),
  });

  const entitlements = setEntitlements({
    ...getEntitlements(),
    [ENTITLEMENT_KEYS.SCHOOL_LICENSE]: true,
  });

  return { request, entitlements };
};

export const clearSchoolLicenseRequest = () => {
  const current = getSchoolLicenseRequest();
  if (current.status === SCHOOL_LICENSE_REQUEST_STATUSES.ACTIVE) {
    return current;
  }
  return setSchoolLicenseRequest(DEFAULT_SCHOOL_LICENSE_REQUEST);
};

export const deactivateSchoolLicense = () => {
  const entitlements = setEntitlements({
    ...getEntitlements(),
    [ENTITLEMENT_KEYS.SCHOOL_LICENSE]: false,
  });
  const request = setSchoolLicenseRequest(DEFAULT_SCHOOL_LICENSE_REQUEST);
  return { entitlements, request };
};

const toItemId = (itemOrId) => {
  if (typeof itemOrId === 'string') return itemOrId;
  if (itemOrId && typeof itemOrId === 'object' && typeof itemOrId.id === 'string') return itemOrId.id;
  return '';
};

export const isPremiumShopItem = (itemOrId) => {
  const id = toItemId(itemOrId);
  return PREMIUM_SHOP_ITEM_IDS.has(id);
};

export const getRequiredEntitlementForShopItem = (itemOrId) => {
  if (!isPremiumShopItem(itemOrId)) return null;
  return ENTITLEMENT_KEYS.FAMILY_PREMIUM;
};

export const isShopItemLockedByEntitlement = (itemOrId, entitlements = getEntitlements()) => {
  const required = getRequiredEntitlementForShopItem(itemOrId);
  if (!required) return false;
  return !hasEntitlement(required, entitlements);
};
