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
pingpong/
├── index.html        # Main game file (self-contained)
├── vercel.json       # Vercel configuration
├── assets/          # Future assets folder (currently empty)
└── v2-server/       # Future multiplayer server (not deployed)
```

### Configuration Details

The `vercel.json` file includes:
- **Rewrites**: Maps `/pingpong` and `/pingpong/` to `index.html`
- **Cache Headers**: 1-hour cache for optimal performance
- **Security Headers**: X-Content-Type-Options and X-Frame-Options

### URL Structure

- **Main game**: `https://cadesgames.aiandsons.io/pingpong`
- **With parameters**: `https://cadesgames.aiandsons.io/pingpong?difficulty=3&speed=1.5&seed=12345`

### Testing

After deployment, test:
- Game loads at `/pingpong` path
- All controls work (W/S, Arrow keys, P, R, 1/2/3)
- URL parameters work (`?difficulty=X&speed=Y&seed=Z`)
- Game works offline (no external dependencies)

### Offline Support

The game is fully self-contained and works offline. No service worker is currently implemented, but one could be added for true offline-first experience.

