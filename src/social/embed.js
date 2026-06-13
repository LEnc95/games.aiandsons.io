// Drop-in social widget for games: score submit, leaderboard, challenges, rooms.
// Usage from a game:
//   import { initSocial, reportScore } from '../src/social/embed.js';
//   initSocial({ slug: 'snake' });
//   ... at game over: reportScore(finalScore);
import { get, set } from '../core/storage.js';
import {
  createChallenge,
  ensurePlayer,
  fetchChallenge,
  fetchLeaderboard,
  getChallengeIdFromUrl,
  getLocalPlayer,
  getRoomCodeFromUrl,
  submitScore,
} from './client.js';

const BEST_SCORES_KEY = 'bestScores';

const context = {
  slug: '',
  challengeId: '',
  challenge: null,
  roomCode: '',
  initialized: false,
};


const escapeHtml = (str) => {
  return String(str ?? '').replace(/[&<>"']/g, (match) => {
    switch (match) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
    }
  });
};


const recordLocalBest = (slug, score) => {
  const stored = get(BEST_SCORES_KEY, {});
  const best = stored && typeof stored === 'object' ? stored : {};
  if (typeof best[slug] !== 'number' || score > best[slug]) {
    best[slug] = score;
    set(BEST_SCORES_KEY, best);
  }
};

const STYLE_ID = 'cade-social-style';

const injectStyles = () => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .cade-social-banner {
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      z-index: 9990; background: rgba(26, 11, 46, 0.95); color: #fff;
      border: 2px solid rgba(251, 191, 36, 0.6); border-radius: 12px;
      padding: 10px 18px; font-family: system-ui, sans-serif; font-size: 14px;
      font-weight: 700; box-shadow: 0 6px 24px rgba(0,0,0,0.45); max-width: 92vw;
    }
    .cade-social-banner .cade-social-banner-sub { font-weight: 500; font-size: 12px; color: #a7b8df; }
    .cade-social-dock {
      position: fixed; top: 64px; right: 12px; z-index: 9989;
      display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;
      max-width: min(320px, 92vw); font-family: system-ui, sans-serif;
    }
    .cade-social-dock-inline {
      position: static; justify-content: center; margin: 10px auto 0;
      max-width: 100%;
    }
    .cade-social-panel {
      position: fixed; right: 12px; bottom: 12px; z-index: 9991;
      background: rgba(26, 11, 46, 0.97); color: #fff;
      border: 2px solid rgba(255,255,255,0.18); border-radius: 14px;
      padding: 14px 16px; width: 280px; max-width: 92vw;
      font-family: system-ui, sans-serif; font-size: 13px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.5);
    }
    .cade-social-panel h3 { margin: 0 0 8px; font-size: 14px; color: #fbbf24; }
    .cade-social-panel ol { margin: 6px 0; padding-left: 20px; }
    .cade-social-panel li { margin: 2px 0; }
    .cade-social-panel .cade-social-me { color: #fbbf24; font-weight: 700; }
    .cade-social-result-win { color: #4ade80; font-weight: 700; }
    .cade-social-result-lose { color: #f87171; font-weight: 700; }
    .cade-social-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .cade-social-btn {
      cursor: pointer; border: 2px solid rgba(251,191,36,0.5); border-radius: 10px;
      background: rgba(251,191,36,0.18); color: #fef3c7; font-weight: 700;
      font-size: 12px; padding: 7px 10px; font-family: inherit;
    }
    .cade-social-btn:hover { background: rgba(251,191,36,0.32); }
    .cade-social-btn:disabled { opacity: 0.65; cursor: default; }
    .cade-social-close {
      position: absolute; top: 6px; right: 10px; cursor: pointer; background: none;
      border: none; color: #a7b8df; font-size: 16px; font-weight: 700;
    }
    .cade-social-handle { font-size: 11px; color: #a7b8df; margin-top: 8px; }
    .cade-social-empty { color: #a7b8df; margin: 8px 0; }
    @media (max-width: 640px) {
      .cade-social-dock:not(.cade-social-dock-inline) { top: auto; right: 10px; bottom: 10px; max-width: calc(100vw - 20px); }
      .cade-social-panel { right: 10px; bottom: 64px; width: min(280px, calc(100vw - 20px)); }
    }
  `;
  document.head.appendChild(style);
};

const removeNode = (id) => {
  const node = document.getElementById(id);
  if (node) node.remove();
};

const showChallengeBanner = (challenge) => {
  injectStyles();
  removeNode('cade-social-banner');
  const banner = document.createElement('div');
  banner.id = 'cade-social-banner';
  banner.className = 'cade-social-banner';
  banner.setAttribute('role', 'status');
  banner.textContent = '';
  banner.insertAdjacentHTML('beforeend', `⚔️ Beat ${escapeHtml(challenge.handle)}'s score of ${escapeHtml(challenge.score)}!\n<div class="cade-social-banner-sub">Finish a run to take the crown.</div>`);
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 12000);
};

const showRoomBanner = (roomCode) => {
  injectStyles();
  removeNode('cade-social-banner');
  const banner = document.createElement('div');
  banner.id = 'cade-social-banner';
  banner.className = 'cade-social-banner';
  banner.setAttribute('role', 'status');
  banner.textContent = '';
  banner.insertAdjacentHTML('beforeend', `\u{1F3C1} Racing in room ${escapeHtml(roomCode)}!\n<div class="cade-social-banner-sub">Your score posts to the room scoreboard automatically.</div>`);
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 9000);
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const renderLeaderboardPanel = ({ board, period = 'daily' }) => {
  injectStyles();
  removeNode('cade-social-panel');

  const panel = document.createElement('div');
  panel.id = 'cade-social-panel';
  panel.className = 'cade-social-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Leaderboard');

  const title = period === 'daily' ? "Today's leaderboard" : 'Leaderboard';
  const top = Array.isArray(board.top) ? board.top.slice(0, 10) : [];
  const player = getLocalPlayer();
  const handle = player ? player.handle : '';
  const lines = [
    '<button class="cade-social-close" aria-label="Close">×</button>',
    `<h3>\u{1F3C6} ${title}</h3>`,
  ];

  if (top.length) {
    lines.push('<ol>');
    for (const entry of top) {
      const cls = entry.handle === handle ? ' class="cade-social-me"' : '';
      lines.push(`<li${cls}>${escapeHtml(entry.handle)} — ${escapeHtml(entry.score)}</li>`);
    }
    lines.push('</ol>');
  } else {
    lines.push('<div class="cade-social-empty">No scores yet. Finish a run to claim the board.</div>');
  }

  lines.push('<div class="cade-social-actions">');
  lines.push('<button class="cade-social-btn" data-action="refresh-leaderboard">\u{1F504} Refresh</button>');
  lines.push(`<a class="cade-social-btn" href="/rooms" style="text-decoration:none">\u{1F3C1} Race friends</a>`);
  lines.push('</div>');

  if (handle) {
    lines.push(`<div class="cade-social-handle">Playing as ${escapeHtml(handle)}</div>`);
  }

  panel.textContent = '';
  panel.insertAdjacentHTML('beforeend', lines.join(''));
  document.body.appendChild(panel);

  panel.querySelector('.cade-social-close').addEventListener('click', () => panel.remove());
  panel.querySelector('[data-action="refresh-leaderboard"]').addEventListener('click', () => showLeaderboard());
};

const showLeaderboard = async () => {
  if (!context.slug) return;
  injectStyles();
  const button = document.querySelector('#cade-social-dock [data-action="leaderboard"]');
  if (button) {
    button.disabled = true;
    button.textContent = 'Loading...';
  }
  try {
    const board = await fetchLeaderboard(context.slug, 'daily');
    renderLeaderboardPanel({ board, period: 'daily' });
  } catch {
    removeNode('cade-social-panel');
    const panel = document.createElement('div');
    panel.id = 'cade-social-panel';
    panel.className = 'cade-social-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Leaderboard unavailable');
    panel.textContent = '';
    panel.insertAdjacentHTML('beforeend', [
      '<button class="cade-social-close" aria-label="Close">×</button>',
      '<h3>\u{1F3C6} Leaderboard</h3>',
      '<div class="cade-social-empty">Leaderboard is unavailable right now.</div>',
    ].join(''));
    document.body.appendChild(panel);
    panel.querySelector('.cade-social-close').addEventListener('click', () => panel.remove());
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = '\u{1F3C6} Leaderboard';
    }
  }
};

const mountSocialDock = () => {
  injectStyles();
  if (document.getElementById('cade-social-dock')) return;

  const dock = document.createElement('div');
  dock.id = 'cade-social-dock';
  dock.className = 'cade-social-dock';
  dock.setAttribute('aria-label', 'Social game tools');
  dock.textContent = '';
  dock.insertAdjacentHTML('beforeend', [
    '<button class="cade-social-btn" data-action="leaderboard">\u{1F3C6} Leaderboard</button>',
    '<a class="cade-social-btn" href="/rooms" style="text-decoration:none">\u{1F3C1} Race friends</a>',
  ].join(''));

  const inlineHost = document.querySelector('[data-cade-social-host]') || document.querySelector('.hud');
  if (inlineHost) {
    dock.classList.add('cade-social-dock-inline');
    inlineHost.appendChild(dock);
  } else {
    document.body.appendChild(dock);
  }

  dock.querySelector('[data-action="leaderboard"]').addEventListener('click', showLeaderboard);
};

const renderResultPanel = ({ score, result }) => {
  injectStyles();
  removeNode('cade-social-panel');

  const panel = document.createElement('div');
  panel.id = 'cade-social-panel';
  panel.className = 'cade-social-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Score results');

  const player = getLocalPlayer();
  const handle = player ? player.handle : '';
  const lines = [];

  lines.push(`<button class="cade-social-close" aria-label="Close">×</button>`);
  lines.push(`<h3>\u{1F3C6} Score: ${escapeHtml(score)}</h3>`);

  if (result.challenge) {
    if (result.challenge.beaten) {
      lines.push(`<div class="cade-social-result-win">You beat ${escapeHtml(result.challenge.targetHandle)}'s ${escapeHtml(result.challenge.targetScore)}!</div>`);
    } else {
      lines.push(`<div class="cade-social-result-lose">${escapeHtml(result.challenge.targetHandle)}'s ${escapeHtml(result.challenge.targetScore)} still stands. Try again!</div>`);
    }
  }

  if (result.daily) {
    lines.push(`<div>Today's rank: <strong>#${result.daily.rank}</strong></div>`);
    const top = Array.isArray(result.daily.top) ? result.daily.top.slice(0, 5) : [];
    if (top.length) {
      lines.push('<ol>');
      for (const entry of top) {
        const cls = entry.handle === handle ? ' class="cade-social-me"' : '';
        lines.push(`<li${cls}>${escapeHtml(entry.handle)} — ${escapeHtml(entry.score)}</li>`);
      }
      lines.push('</ol>');
    }
  }

  if (context.roomCode) {
    if (result.room) {
      lines.push('<div class="cade-social-result-win">Room score posted.</div>');
    } else {
      lines.push('<div class="cade-social-result-lose">Room score was not posted. The race may be over.</div>');
    }
  }

  lines.push('<div class="cade-social-actions">');
  lines.push('<button class="cade-social-btn" data-action="challenge">⚔️ Challenge a friend</button>');
  if (context.roomCode) {
    lines.push(`<a class="cade-social-btn" href="/rooms?code=${encodeURIComponent(context.roomCode)}" style="text-decoration:none">\u{1F3C1} Back to room</a>`);
  }
  lines.push('</div>');
  if (handle) {
    lines.push(`<div class="cade-social-handle">Playing as ${escapeHtml(handle)}</div>`);
  }

  panel.textContent = '';
  panel.insertAdjacentHTML('beforeend', lines.join(''));
  document.body.appendChild(panel);

  panel.querySelector('.cade-social-close').addEventListener('click', () => panel.remove());

  const challengeButton = panel.querySelector('[data-action="challenge"]');
  challengeButton.addEventListener('click', async () => {
    challengeButton.disabled = true;
    challengeButton.textContent = 'Creating link…';
    try {
      const data = await createChallenge({ gameSlug: context.slug, score });
      const url = `${window.location.origin}${data.challenge.url}`;
      const copied = await copyText(`Beat my score of ${escapeHtml(score)} in ${context.slug}! ${url}`);
      challengeButton.textContent = copied ? '✅ Link copied!' : url;
    } catch {
      challengeButton.textContent = 'Could not create link';
      challengeButton.disabled = false;
    }
  });
};

export const initSocial = ({ slug }) => {
  if (context.initialized) return;
  context.initialized = true;
  context.slug = String(slug || '').trim();
  context.challengeId = getChallengeIdFromUrl();
  context.roomCode = getRoomCodeFromUrl();

  mountSocialDock();

  // Register lazily so first reportScore is fast.
  ensurePlayer().catch(() => {});

  if (context.challengeId) {
    fetchChallenge(context.challengeId)
      .then((data) => {
        if (data.challenge.gameSlug === context.slug) {
          context.challenge = data.challenge;
          showChallengeBanner(data.challenge);
        } else {
          context.challengeId = '';
        }
      })
      .catch(() => { context.challengeId = ''; });
  } else if (context.roomCode) {
    showRoomBanner(context.roomCode);
  }
};

export const reportScore = async (score) => {
  const normalized = Math.max(0, Math.floor(Number(score) || 0));
  if (!context.slug) return null;
  recordLocalBest(context.slug, normalized);

  try {
    const result = await submitScore({
      gameSlug: context.slug,
      score: normalized,
      challengeId: context.challengeId,
      roomCode: context.roomCode,
    });
    renderResultPanel({ score: normalized, result });
    return result;
  } catch {
    // Offline or backend unavailable: stay silent, never break the game.
    return null;
  }
};
