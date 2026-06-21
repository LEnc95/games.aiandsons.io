// Reusable share helpers for games, challenges, and rooms.
//
// The URL/text builders are pure (no DOM or navigator) so they can be unit
// tested in Node (see tests/share.integration.test.mjs). The sheet UI and
// native-share helpers touch browser APIs lazily, only when invoked.
//
// CSP note: every share target is a plain https anchor or a browser API
// (navigator.share / clipboard). No third-party scripts are loaded, so this
// stays within the strict "self + Google" CSP in vercel.json.

const BRAND = 'AI & Sons Arcade';

// Pure: build platform share-intent URLs for a link + caption.
export const buildShareUrls = ({ url = '', text = '' } = {}) => {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  const textThenUrl = text ? `${t}%20${u}` : u;
  return {
    x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    whatsapp: `https://api.whatsapp.com/send?text=${textThenUrl}`,
    telegram: `https://t.me/share/url?url=${u}&text=${t}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    reddit: `https://www.reddit.com/submit?url=${u}&title=${t}`,
  };
};

// Display order + labels for the share sheet.
export const SHARE_TARGETS = [
  { key: 'x', label: 'X', emoji: '\u{1D54F}' },
  { key: 'whatsapp', label: 'WhatsApp', emoji: '\u{1F4AC}' },
  { key: 'telegram', label: 'Telegram', emoji: '✈️' },
  { key: 'facebook', label: 'Facebook', emoji: '\u{1F4D8}' },
  { key: 'reddit', label: 'Reddit', emoji: '\u{1F47D}' },
];

export const canNativeShare = (files) => {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (files && files.length) {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files });
  }
  return true;
};

export const nativeShare = async ({ title, text, url, files } = {}) => {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  try {
    if (files && files.length && canNativeShare(files)) {
      await navigator.share({ title, text, files });
    } else {
      await navigator.share({ title, text, url });
    }
    return true;
  } catch {
    // User cancelled the share sheet, or the call was rejected. Not an error.
    return false;
  }
};

export const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, (match) => {
  switch (match) {
    case '&': return '&amp;';
    case '<': return '&lt;';
    case '>': return '&gt;';
    case '"': return '&quot;';
    case "'": return '&#39;';
    default: return match;
  }
});

const STYLE_ID = 'cade-share-style';

const injectStyles = () => {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .cade-share-overlay {
      position: fixed; inset: 0; z-index: 10000; display: flex;
      align-items: center; justify-content: center; padding: 16px;
      background: rgba(8, 4, 18, 0.62); font-family: system-ui, sans-serif;
    }
    .cade-share-card {
      background: rgba(26, 11, 46, 0.98); color: #fff; width: 340px; max-width: 94vw;
      border: 2px solid rgba(251, 191, 36, 0.5); border-radius: 16px; padding: 18px 18px 20px;
      box-shadow: 0 18px 60px rgba(0,0,0,0.55); position: relative;
    }
    .cade-share-card h3 { margin: 0 0 4px; font-size: 16px; color: #fbbf24; }
    .cade-share-card .cade-share-sub { margin: 0 0 14px; font-size: 12px; color: #a7b8df; word-break: break-all; }
    .cade-share-native {
      display: block; width: 100%; cursor: pointer; margin-bottom: 12px;
      border: none; border-radius: 12px; padding: 12px; font-weight: 800; font-size: 14px;
      font-family: inherit; color: #1a0b2e; background: #fbbf24;
    }
    .cade-share-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px; }
    .cade-share-target {
      display: flex; flex-direction: column; align-items: center; gap: 4px; text-decoration: none;
      color: #e7ecff; font-size: 10px; font-weight: 600; padding: 8px 2px; border-radius: 10px;
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    }
    .cade-share-target:hover { background: rgba(255,255,255,0.14); }
    .cade-share-target span.emoji { font-size: 20px; line-height: 1; }
    .cade-share-copy {
      display: block; width: 100%; cursor: pointer; border-radius: 12px; padding: 11px;
      font-weight: 700; font-size: 13px; font-family: inherit; color: #fef3c7;
      background: rgba(251,191,36,0.18); border: 2px solid rgba(251,191,36,0.5);
    }
    .cade-share-copy:hover { background: rgba(251,191,36,0.3); }
    .cade-share-close {
      position: absolute; top: 8px; right: 12px; cursor: pointer; background: none; border: none;
      color: #a7b8df; font-size: 20px; font-weight: 700; line-height: 1;
    }
  `;
  document.head.appendChild(style);
};

// Open a share sheet popover: native share (when available), one-tap social
// targets, and copy-link. Returns the overlay element (or null in non-DOM env).
export const openShareSheet = ({ title = 'Share', text = '', url = '' } = {}) => {
  if (typeof document === 'undefined') return null;
  injectStyles();
  const existing = document.getElementById('cade-share-overlay');
  if (existing) existing.remove();

  const urls = buildShareUrls({ url, text });
  const overlay = document.createElement('div');
  overlay.id = 'cade-share-overlay';
  overlay.className = 'cade-share-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Share');

  const targetsMarkup = SHARE_TARGETS.map((target) => `
    <a class="cade-share-target" href="${escapeHtml(urls[target.key])}" target="_blank" rel="noopener noreferrer" data-target="${target.key}">
      <span class="emoji" aria-hidden="true">${target.emoji}</span>${escapeHtml(target.label)}
    </a>
  `).join('');

  const nativeMarkup = canNativeShare()
    ? '<button class="cade-share-native" data-action="native">\u{1F4E4} Share…</button>'
    : '';

  overlay.innerHTML = `
    <div class="cade-share-card">
      <button class="cade-share-close" aria-label="Close">×</button>
      <h3>${escapeHtml(title)}</h3>
      <p class="cade-share-sub">${escapeHtml(url)}</p>
      ${nativeMarkup}
      <div class="cade-share-grid">${targetsMarkup}</div>
      <button class="cade-share-copy" data-action="copy">\u{1F517} Copy link</button>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelector('.cade-share-close').addEventListener('click', close);

  const nativeBtn = overlay.querySelector('[data-action="native"]');
  if (nativeBtn) {
    nativeBtn.addEventListener('click', async () => {
      const ok = await nativeShare({ title, text, url });
      if (ok) close();
    });
  }

  const copyBtn = overlay.querySelector('[data-action="copy"]');
  copyBtn.addEventListener('click', async () => {
    const copied = await copyText(text ? `${text} ${url}` : url);
    copyBtn.textContent = copied ? '✅ Copied!' : '\u{1F517} Copy link';
  });

  document.body.appendChild(overlay);
  return overlay;
};
