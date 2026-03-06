import { get, set } from './storage.js';

export const ENTITLEMENT_KEYS = Object.freeze({
  FAMILY_PREMIUM: 'familyPremium',
  SCHOOL_LICENSE: 'schoolLicense',
});

export const DEFAULT_ENTITLEMENTS = Object.freeze({
  [ENTITLEMENT_KEYS.FAMILY_PREMIUM]: false,
  [ENTITLEMENT_KEYS.SCHOOL_LICENSE]: false,
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
  return {
    [ENTITLEMENT_KEYS.FAMILY_PREMIUM]: Boolean(raw[ENTITLEMENT_KEYS.FAMILY_PREMIUM]),
    [ENTITLEMENT_KEYS.SCHOOL_LICENSE]: Boolean(raw[ENTITLEMENT_KEYS.SCHOOL_LICENSE]),
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
