# Subagents Setup

This folder contains reusable subagent role prompts for this repository.

## Available Roles
- `clubpenguin-server.agent.md`
- `clubpenguin-client.agent.md`
- `clubpenguin-qa.agent.md`

## How To Use
1. Pick one subagent per non-overlapping write scope.
2. Give each subagent exactly one role prompt from this folder.
3. Keep ownership boundaries strict:
   - server role: `clubpenguin-world/main.go`, `clubpenguin-world/main_test.go`
   - client role: `clubpenguin-world/public/index.html`, `clubpenguin-world/public/client.js`
   - qa role: test runs, screenshots/state artifacts, and notes updates (`progress.md`, sprint docs)
4. Merge results only after each subagent returns:
   - changed files list
   - tests executed
   - residual risks

## Handoff Contract
Each subagent should return:
- `Summary`: what changed and why.
- `Files`: exact paths edited.
- `Validation`: commands run + pass/fail.
- `Follow-ups`: TODOs or risks.

