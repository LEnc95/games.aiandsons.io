# Linear Tracking Setup

This folder adds a ready-to-import issue tracking setup for the `games.aiandsons.io` repo and also serves as the generated source for live provisioning.

## Included Files

- `game-issues.csv`: one tracking setup issue per game in this repo.
- `labels.md`: recommended labels for consistent triage across games.

## Repo Commands

1. `npm run feedback:sync-linear`
   - Regenerates `labels.md` and `game-issues.csv`.
   - If `LINEAR_API_KEY` and `LINEAR_TEAM_ID` are configured, it also provisions missing Linear labels and baseline issues.
2. `npm run feedback:check-daily`
   - Fails if `labels.md` or `game-issues.csv` are stale compared with `src/meta/feedback.js`.
   - This also runs inside `npm run test:feedback`.
3. `npm run feedback:sync-linear:files`
   - Regenerates only the local files.
4. `npm run feedback:provision-linear`
   - Provisions missing labels and baseline issues directly from repo metadata.

## Linear Setup Steps

1. In Linear, create or open the project `games.aiandsons.io`.
2. Prefer `npm run feedback:sync-linear` or `npm run feedback:provision-linear` when API credentials are available.
3. If you need a manual fallback, create the labels listed in `labels.md` (or the subset you want).
4. Import `game-issues.csv` into Linear.
5. In the import mapping UI, map:
   - `Title` -> Issue title
   - `Description` -> Issue description
   - `Labels` -> Labels
   - `Priority` -> Priority
   - `Project` -> Project
6. Assign each imported issue to the right owner/cycle.

## Permissions Note

- Automatic baseline issue creation only needs issue-creation access plus the target project/team.
- Automatic label creation may require label-management permission for the configured team/workspace.
- If label creation is not permitted, provisioning continues best-effort and reports warnings.

## Tracking Convention

Each game gets a dedicated setup issue named `<Game>: Issue tracking baseline`.
Use that issue as the parent context for bugs/features/chore tasks for that game.
