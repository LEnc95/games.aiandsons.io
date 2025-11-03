# Deployment Instructions

## Vercel Deployment

This Pong game is configured for deployment to Vercel at `cadesgames.aiandsons.io/pingpong`.

### Quick Deploy

1. **Connect to Vercel**
   - Push this repository to GitHub
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "New Project" and import your repository

2. **Configure Domain**
   - In project settings, go to "Domains"
   - Add `cadesgames.aiandsons.io` as a domain
   - The game will be accessible at `cadesgames.aiandsons.io/pingpong`

3. **Deploy**
   - Vercel will automatically detect the static site
   - No build command needed - pure static HTML
   - Deployment happens automatically on git push

### File Structure

```
/
├── pingpong/
│   ├── index.html    # Main game file (self-contained)
│   └── assets/      # Game-specific assets (future)
├── vercel.json       # Root-level routing configuration
├── v2-server/       # Future multiplayer server (not deployed)
└── (future games can be added as additional folders)
```

### Configuration Details

The `vercel.json` file includes:
- **Rewrites**: Maps `/pingpong` and `/pingpong/` to `/pingpong/index.html`
- **Cache Headers**: 1-hour cache for optimal performance (no-cache for index.html)
- **Security Headers**: X-Content-Type-Options and X-Frame-Options

This monorepo structure allows multiple games to coexist:
- Each game lives in its own folder (e.g., `pingpong/`, `game2/`, etc.)
- Root `vercel.json` handles routing to each game's `index.html`
- Future games can follow the same pattern

### URL Structure

- **Main game**: `https://cadesgames.aiandsons.io/pingpong`
- **With parameters**: `https://cadesgames.aiandsons.io/pingpong?difficulty=3&speed=1.5&seed=12345`

### Versioning

- The site displays a version badge in the bottom-right of the homepage.
- Source of truth: `version.json` at the repo root with `{ "version": "x.y.z" }`.
- Before merging/deploying changes that affect the app, bump `version.json` (e.g., 0.1.0 → 0.1.1).
- The homepage fetches `version.json` and shows `vX.Y.Z`.

### Testing

After deployment, test:
- Game loads at `/pingpong` path
- All controls work (W/S, Arrow keys, P, R, 1/2/3)
- URL parameters work (`?difficulty=X&speed=Y&seed=Z`)
- Game works offline (no external dependencies)

### Offline Support

The game is fully self-contained and works offline. No service worker is currently implemented, but one could be added for true offline-first experience.

