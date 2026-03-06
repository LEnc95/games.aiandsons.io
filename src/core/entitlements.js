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
