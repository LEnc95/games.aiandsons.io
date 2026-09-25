import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { GAMES } from "../src/meta/games.js";
import { buildSitemap } from "../scripts/generate-sitemap.mjs";

test("sitemap builder returns valid XML covering every registered game", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sitemap-integration-"));
  try {
    fs.writeFileSync(path.join(directory, "index.html"), "<!doctype html>");
    for (const game of GAMES) {
      const folder = game.url.replace(/^\/+|\/+$/g, "");
      const gameDir = path.join(directory, folder);
      fs.mkdirSync(gameDir, { recursive: true });
      fs.writeFileSync(path.join(gameDir, "index.html"), "<!doctype html>");
    }

    const { xml, urlCount } = buildSitemap({ root: directory, existingXml: "" });
    assert.ok(urlCount >= GAMES.length + 1);
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);

    for (const game of GAMES) {
      let route = game.url.startsWith("/") ? game.url : `/${game.url}`;
      if (route.length > 1 && route.endsWith("/")) route = route.slice(0, -1);
      if (route === "/clubpenguin-world/public") route = "/clubpenguin-world";
      assert.match(
        xml,
        new RegExp(`<loc>https://games\\.aiandsons\\.io${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>`),
        `missing sitemap entry for ${game.slug}`,
      );
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("committed sitemap.xml matches the games registry", () => {
  const sitemap = fs.readFileSync(path.join(process.cwd(), "sitemap.xml"), "utf8");
  for (const game of GAMES) {
    let route = game.url.startsWith("/") ? game.url : `/${game.url}`;
    if (route.length > 1 && route.endsWith("/")) route = route.slice(0, -1);
    if (route === "/clubpenguin-world/public") route = "/clubpenguin-world";
    assert.match(
      sitemap,
      new RegExp(`<loc>https://games\\.aiandsons\\.io${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>`),
      `sitemap.xml missing ${game.slug}`,
    );
  }
});
