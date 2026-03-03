# Linear Issue Drafts (Games App)

This document captures issues found during a quick QA/config review so they can be copied into Linear.

## 1) Clean `/shop` URL is not configured (only `/shop.html` works)

- **Type:** Bug
- **Priority suggestion:** Medium
- **Area:** Routing / navigation

### Evidence
- Top nav links directly to `href="/shop.html"` instead of a clean route.【F:index.html†L96】
- Vercel rewrites exist for game routes (`/pong`, `/snake`, etc.) but there is no rewrite for `/shop` or `/shop/` in `vercel.json`.【F:vercel.json†L7-L136】
- Local smoke check confirms `/shop` returns 404 with a static server while `/shop.html` works.

### Repro steps
1. Run a static server from repo root (`python3 -m http.server 8080`).
2. Visit `http://localhost:8080/shop`.
3. Observe 404.
4. Visit `http://localhost:8080/shop.html`.
5. Observe page loads.

### Expected
- `/shop` and `/shop/` should resolve to the shop page, consistent with game routes.

### Actual
- Only `/shop.html` works reliably.

---

## 2) Homepage/shop HTML likely cached too aggressively for release velocity

- **Type:** Improvement / reliability
- **Priority suggestion:** Medium
- **Area:** Deployment caching

### Evidence
- Global headers set `Cache-Control: public, max-age=3600, s-maxage=3600` for all routes.【F:vercel.json†L139-L154】
- Per-page no-cache overrides are present for each game `*/index.html` page, but there are no equivalent overrides for root `index.html` or `shop.html`.【F:vercel.json†L157-L290】

### Why this matters
- User-facing changes on homepage/shop may appear delayed for up to an hour depending on CDN/client cache behavior.

### Suggested fix
- Add explicit `must-revalidate` (or lower max-age) header entries for `/index.html` and `/shop.html` similar to game pages.

---

## 3) Automated tests do not validate route/rewrite coverage for all user-visible pages

- **Type:** Test gap
- **Priority suggestion:** Low-Medium
- **Area:** QA automation

### Evidence
- Existing integration test only validates shop item consistency and game-prefix mapping for inventory items.【F:tests/shop-items.integration.test.mjs†L1-L118】
- There is no automated check that every launcher/shop route has corresponding Vercel rewrite coverage.

### Risk
- Route regressions (e.g., missing `/shop` rewrite) can ship unnoticed.

### Suggested fix
- Add a small CI test that parses `src/meta/games.js` + key top-level pages and asserts rewrite entries exist for clean URLs.

---

## Validation commands used

- `node --test tests/shop-items.integration.test.mjs`
- `python3 -m http.server 8080`
- `curl -I http://127.0.0.1:8080/shop`
- Playwright smoke navigation across homepage, shop, and all game routes.
