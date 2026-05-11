const fs = require('fs');
let code = fs.readFileSync('src/core/state.js', 'utf8');

code = code.replace(
`export const isGameLockedByClassroom = (slug, now = Date.now()) => {
  if (typeof slug !== 'string' || !slug.trim()) return false;
  if (!isClassroomSessionActive(now)) return false;
  const whitelist = state.classroom.gameWhitelist;
  if (!Array.isArray(whitelist) || whitelist.length === 0) return false;
  return !whitelist.includes(slug);
};`,
`export const isGameLockedByClassroom = (slug, now = Date.now()) => {
  if (typeof slug !== 'string' || !slug.trim()) return false;
  if (!isClassroomSessionActive(now)) return false;
  const whitelist = state.classroom.gameWhitelist;
  if (!Array.isArray(whitelist) || whitelist.length === 0) return false;

  if (!state.classroom._whitelistSet || state.classroom._whitelistArrayRef !== whitelist) {
    state.classroom._whitelistSet = new Set(whitelist);
    state.classroom._whitelistArrayRef = whitelist;
  }
  return !state.classroom._whitelistSet.has(slug);
};`
);

fs.writeFileSync('src/core/state.js', code);
