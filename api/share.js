// Share landing pages — /challenge/:id, /race/:code, /g/:slug.
//
// vercel.json rewrites those pretty URLs to /api/share?type=...&id=..., mirroring
// the router-on-query-param convention used by api/social.js and api/billing.js.
// The page serves Open Graph meta for crawlers, then redirects humans to the
// game/room. Game metadata comes from the registry; challenge/room lookups reuse
// the social store (in-memory fallback when Firebase Admin is not configured).
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const {
  buildChallengeLanding,
  buildRoomLanding,
  buildGameLanding,
  buildFallbackLanding,
} = require("./share/_render");
const { getChallenge, getRoom } = require("./social/_store");

function normalizeId(value, maxLength = 64) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeSlug(value) {
  return normalizeId(value, 80).toLowerCase().replace(/[^a-z0-9-]/g, "");
}

let gamesMetaPromise = null;
async function loadGamesMeta() {
  if (!gamesMetaPromise) {
    const metaPath = path.join(process.cwd(), "src", "meta", "games.js");
    gamesMetaPromise = import(pathToFileURL(metaPath).href);
  }
  return gamesMetaPromise;
}

async function getGameMeta(slug) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  try {
    const meta = await loadGamesMeta();
    const games = Array.isArray(meta.GAMES) ? meta.GAMES : [];
    return games.find((game) => game.slug === normalized) || null;
  } catch {
    return null;
  }
}

function getParams(req) {
  const parsed = new URL(req?.url || "/", "http://localhost");
  return {
    type: (parsed.searchParams.get("type") || "").trim().toLowerCase(),
    id: parsed.searchParams.get("id") || "",
  };
}

function sendHtml(res, statusCode, html) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

module.exports = async function handler(req, res) {
  const { type, id } = getParams(req);

  try {
    if (type === "challenge") {
      const challengeId = normalizeId(id, 40);
      const challenge = challengeId ? await getChallenge(challengeId) : null;
      if (!challenge) {
        return sendHtml(res, 200, buildFallbackLanding({ redirectUrl: "/" }));
      }
      const game = await getGameMeta(challenge.gameSlug);
      return sendHtml(res, 200, buildChallengeLanding({
        id: challenge.id,
        gameSlug: challenge.gameSlug,
        gameName: game ? game.name : "",
        handle: challenge.handle,
        score: challenge.score,
      }));
    }

    if (type === "room" || type === "race") {
      const code = normalizeId(id, 8);
      const room = code ? await getRoom(code) : null;
      if (!room) {
        return sendHtml(res, 200, buildFallbackLanding({ redirectUrl: "/rooms" }));
      }
      const game = await getGameMeta(room.gameSlug);
      return sendHtml(res, 200, buildRoomLanding({
        code: room.code,
        gameSlug: room.gameSlug,
        gameName: game ? game.name : "",
      }));
    }

    if (type === "game") {
      const slug = normalizeSlug(id);
      const game = slug ? await getGameMeta(slug) : null;
      if (!game) {
        return sendHtml(res, 200, buildFallbackLanding({ redirectUrl: "/" }));
      }
      return sendHtml(res, 200, buildGameLanding({
        gameSlug: game.slug,
        gameName: game.name,
        desc: game.desc,
      }));
    }

    return sendHtml(res, 200, buildFallbackLanding({ redirectUrl: "/" }));
  } catch (error) {
    // Never break an unfurl/redirect: fall back to the branded home card.
    return sendHtml(res, 200, buildFallbackLanding({ redirectUrl: "/" }));
  }
};
