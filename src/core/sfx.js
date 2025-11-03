// Optional sound effects with graceful fallback
export const sfx = {
  click: null,
  badge: null,
  coin: null,
};

// Try to load sounds (gracefully fails if files don't exist)
try {
  sfx.click = new Audio('/assets/click.mp3');
  sfx.badge = new Audio('/assets/badge.mp3');
  sfx.coin = new Audio('/assets/coin.mp3');
} catch {}

export const play = (a) => { 
  try { 
    if (sfx[a]) {
      sfx[a].currentTime = 0; 
      sfx[a].play().catch(() => {}); 
    }
  } catch {} 
};

