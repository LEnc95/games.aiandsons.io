# Daily release command runner

Use `node scripts/automation/run-release-gates.mjs` from an isolated release
worktree. It runs the existing package scripts in this fixed order:

1. `maintenance:validate`
2. `game:preflight`
3. `test:telemetry`
4. `test:feedback`
5. `test:shop`
6. `test:social`
7. `git diff --check`

The runner locates the installed `npm-cli.js` and calls it with the current Node
executable and argument arrays (`shell: false`). This avoids Windows PowerShell's
`npm.ps1` argument reconstruction: a call such as `& npm run $gate` can reach npm
as `pm run ...`. For other commands in Windows PowerShell use `npm.cmd` and
`npx.cmd`, including dependency installation and scoped SEO/OG generation.

A nonzero status, launch error, signal, or missing status stops the sequence.
There are no skip flags, automatic retries, or publishing actions. The process
returns the failed check's exit code where available. A shell typo is not a
passing validation, and output text alone must never establish success.

If a process provably did not launch because of an invocation error, correct the
invocation once and rerun the entire ordered gate. Do not classify test assertion
failures, executed commands with nonzero statuses, audit failures, authentication
errors, or branch-protection rejections as launcher errors. An actual gate failure
stops the unattended release; no staging, committing, pushing, or merging follows.
After a successful rebase, repeat the complete runner and the separate authoritative
release-diff audit. This runner does not replace browser QA, generated-byte
idempotence checks, staged-diff inspection, the lane audit, PR checks, or production
verification.

Regression tests exercise real npm scripts in a directory containing spaces,
failure propagation, signals/launch errors, script order, and shell-free arguments.
They run in the telemetry suite on Linux CI and in a dedicated Windows Main QA
job. No dependencies are added for this runner or its tests.
