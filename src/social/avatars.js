export const AVATAR_EMOJI = Object.freeze([
  '🦊', '🐼', '🐸', '🦖', '🐙', '🦉', '🐯', '🐧',
  '🦄', '🐲', '🦈', '🐺', '🦜', '🐢', '🦁', '🐹',
]);

export const DEFAULT_AVATAR_EMOJI = AVATAR_EMOJI[0];

export const isAvatarEmoji = (value) => AVATAR_EMOJI.includes(String(value || ''));

// Deterministic emoji avatar derived from a handle, so the same player
// always shows the same face on leaderboards and scoreboards.
export const handleEmoji = (handle) => {
  const text = String(handle || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return AVATAR_EMOJI[Math.abs(hash) % AVATAR_EMOJI.length];
};
