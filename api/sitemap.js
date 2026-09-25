// Serves /sitemap.xml when the committed static file is missing from a deployment.
// vercel.json rewrites /sitemap.xml -> /api/sitemap only in that case.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = process.cwd();
const STATIC_SITEMAP = path.join(ROOT, "sitemap.xml");

let generationPromise = null;

async function loadSitemapBuilder() {
  const scriptPath = path.join(ROOT, "scripts", "generate-sitemap.mjs");
  const mod = await import(pathToFileURL(scriptPath).href);
  if (typeof mod.buildSitemap !== "function") {
    throw new Error("scripts/generate-sitemap.mjs did not export buildSitemap");
  }
  return mod.buildSitemap;
}

async function buildSitemapXml() {
  const buildSitemap = await loadSitemapBuilder();
  const existingXml = fs.existsSync(STATIC_SITEMAP)
    ? fs.readFileSync(STATIC_SITEMAP, "utf8")
    : "";
  return buildSitemap({ root: ROOT, existingXml });
}

async function getSitemapPayload() {
  if (!generationPromise) {
    generationPromise = buildSitemapXml();
  }
  return generationPromise;
}

module.exports = async function handler(_req, res) {
  try {
    const { xml, urlCount } = await getSitemapPayload();
    if (!xml || urlCount < 1) {
      throw new Error("Sitemap generation returned no URLs");
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.end(xml);
  } catch (error) {
    console.error("Sitemap generation failed:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("Sitemap generation failed.");
  }
};
