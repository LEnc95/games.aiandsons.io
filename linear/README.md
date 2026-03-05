# Linear Tracking Setup

This folder adds a ready-to-import issue tracking setup for the `games.aiandsons.io` repo.

## Included Files

- `game-issues.csv`: one tracking setup issue per game in this repo.
- `labels.md`: recommended labels for consistent triage across games.

## Linear Setup Steps

1. In Linear, create or open the project `games.aiandsons.io`.
2. Create the labels listed in `labels.md` (or the subset you want).
3. Import `game-issues.csv` into Linear.
4. In the import mapping UI, map:
   - `Title` -> Issue title
   - `Description` -> Issue description
   - `Labels` -> Labels
   - `Priority` -> Priority
   - `Project` -> Project
5. Assign each imported issue to the right owner/cycle.

## Tracking Convention

Each game gets a dedicated setup issue named `<Game>: Issue tracking baseline`.
Use that issue as the parent context for bugs/features/chore tasks for that game.