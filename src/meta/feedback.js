import { GAMES } from "./games.js";

function normalizeRoute(route = "") {
  const trimmed = String(route || "").trim();
  if (!trimmed) return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
}

export function getGameFolderFromRoute(route = "") {
  const normalized = normalizeRoute(route);
  return normalized.replace(/^\/+/, "");
}

export const FEEDBACK_GAMES = GAMES.map((game) => {
  const route = normalizeRoute(game.url);
  const folder = getGameFolderFromRoute(route);
  return {
    slug: game.slug,
    name: game.name,
    route,
    folder,
    filePath: `${folder}/index.html`,
    label: `game/${game.slug}`,
  };
});

export const FEEDBACK_COMMON_LABELS = [
  "setup",
  "tracking",
  "kind/bug",
  "kind/feature",
  "kind/chore",
  "blocked",
  "source/feedback",
  "status/needs-triage",
  "status/agent-ready",
  "status/duplicate",
];

export const FEEDBACK_GAME_LABELS = FEEDBACK_GAMES.map((game) => game.label);

export const FEEDBACK_ALL_LABELS = [...new Set([
  ...FEEDBACK_COMMON_LABELS,
  ...FEEDBACK_GAME_LABELS,
])];

const FEEDBACK_GAME_BY_SLUG = new Map(
  FEEDBACK_GAMES.map((game) => [game.slug, game]),
);

export function getFeedbackGameBySlug(slug = "") {
  return FEEDBACK_GAME_BY_SLUG.get(String(slug || "").trim()) || null;
}
