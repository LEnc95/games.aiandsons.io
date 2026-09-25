import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

import { GAMES } from "../src/meta/games.js";

const require = createRequire(import.meta.url);
const sitemapHandler = require("../api/sitemap.js");

function mockRequest() {
  const req = Readable.from([]);
  req.method = "GET";
  req.url = "/api/sitemap";
  req.headers = {};
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    ended: false,
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    },
    end(body) {
      this.body = body;
      this.ended = true;
    },
  };
}

test("sitemap API returns valid XML covering every registered game", async () => {
  const res = mockResponse();
  await sitemapHandler(mockRequest(), res);

  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"], /application\/xml/i);
  assert.match(res.body, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(res.body, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);

  for (const game of GAMES) {
    let route = game.url.startsWith("/") ? game.url : `/${game.url}`;
    if (route.length > 1 && route.endsWith("/")) route = route.slice(0, -1);
    if (route === "/clubpenguin-world/public") route = "/clubpenguin-world";
    assert.match(
      res.body,
      new RegExp(`<loc>https://games\\.aiandsons\\.io${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>`),
      `missing sitemap entry for ${game.slug}`,
    );
  }
});
