import { get, set } from './storage.js';

export const ACCESSIBILITY_COLOR_PROFILES = Object.freeze([
  'standard',
  'protanopia',
  'deuteranopia',
  'tritanopia',
]);

export const DEFAULT_ACCESSIBILITY_SETTINGS = Object.freeze({
  colorProfile: 'standard',
  largeUi: false,
  reducedMotion: false,
  highContrast: false,
});

export const normalizeAccessibilitySettings = (source) => {
  const raw = source && typeof source === 'object' ? source : {};
  const colorProfileRaw = typeof raw.colorProfile === 'string' ? raw.colorProfile.trim().toLowerCase() : 'standard';
  const colorProfile = ACCESSIBILITY_COLOR_PROFILES.includes(colorProfileRaw) ? colorProfileRaw : 'standard';
  return {
    colorProfile,
    largeUi: Boolean(raw.largeUi),
    reducedMotion: Boolean(raw.reducedMotion),
    highContrast: Boolean(raw.highContrast),
  };
};

export const getAccessibilitySettings = () => {
  return normalizeAccessibilitySettings(get('accessibility', DEFAULT_ACCESSIBILITY_SETTINGS));
};

export const applyAccessibilityToDocument = (settings = getAccessibilitySettings(), doc = globalThis.document) => {
  if (!doc || !doc.documentElement) return normalizeAccessibilitySettings(settings);
  const normalized = normalizeAccessibilitySettings(settings);
  const root = doc.documentElement;
  root.dataset.a11yColorProfile = normalized.colorProfile;
  root.classList.toggle('a11y-large-ui', normalized.largeUi);
  root.classList.toggle('a11y-reduced-motion', normalized.reducedMotion);
  root.classList.toggle('a11y-high-contrast', normalized.highContrast);
  return normalized;
};

export const setAccessibilitySettings = (patch) => {
  const next = normalizeAccessibilitySettings({
    ...getAccessibilitySettings(),
    ...(patch && typeof patch === 'object' ? patch : {}),
  });
  set('accessibility', next);
  applyAccessibilityToDocument(next);
  return next;
};

export const resetAccessibilitySettings = () => {
  set('accessibility', DEFAULT_ACCESSIBILITY_SETTINGS);
  return applyAccessibilityToDocument(DEFAULT_ACCESSIBILITY_SETTINGS);
};

export const loadAndApplyAccessibility = () => {
  return applyAccessibilityToDocument(getAccessibilitySettings());
};
