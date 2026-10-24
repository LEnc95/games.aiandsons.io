import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const RELEASE_SCRIPTS = Object.freeze([
  'maintenance:validate',
  'game:preflight',
  'test:telemetry',
  'test:feedback',
  'test:shop',
  'test:social',
]);

// Invoke npm's JS entry point through this Node runtime. Windows npm.ps1
// reconstructs PowerShell invocations and can turn `& npm run ...` into `pm`.
// npm.cmd requires a shell from child_process; neither wrapper is needed here.
export function resolveNpmCli({ env = process.env, execPath = process.execPath, platform = process.platform } = {}) {
  const candidates = [env.npm_execpath, path.join(path.dirname(execPath), 'node_modules/npm/bin/npm-cli.js')];
  const pathValue = env.PATH || env.Path || '';
  for (const directory of pathValue.split(platform === 'win32' ? ';' : ':').filter(Boolean)) {
    candidates.push(path.join(directory, 'node_modules/npm/bin/npm-cli.js'));
    // Unix npm is normally a symlink into ../lib/node_modules/npm/bin/.
    if (platform !== 'win32') candidates.push(path.join(directory, 'npm'));
  }
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const resolved = fs.realpathSync(candidate);
      if (path.basename(resolved) === 'npm-cli.js' && fs.statSync(resolved).isFile()) return resolved;
    } catch { /* Try the next installed npm location. */ }
  }
  throw new Error('Cannot locate npm-cli.js. Install Node with npm or invoke this runner through npm; no gates ran.');
}

export function runReleaseGates({ root = repoRoot, npmCli = resolveNpmCli(), run = spawnSync, logger = console } = {}) {
  const gates = [
    ...RELEASE_SCRIPTS.map(script => ({ name: script, command: process.execPath, args: [npmCli, 'run', script] })),
    { name: 'git diff --check', command: 'git', args: ['diff', '--check'] },
  ];
  const passed = [];
  for (const gate of gates) {
    logger.log(`\nRelease gate ${passed.length + 1}/${gates.length}: ${gate.name}`);
    const result = run(gate.command, gate.args, { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
    if (result.error || result.status !== 0 || result.signal) {
      const detail = result.error ? `could not launch: ${result.error.message}`
        : result.signal ? `terminated by ${result.signal}` : `exited ${result.status ?? 'without a status'}`;
      const error = new Error(`Release gate ${gate.name} ${detail}. Stopped; remaining gates did not run.`);
      error.exitCode = Number.isInteger(result.status) && result.status > 0 && result.status < 256 ? result.status : 1;
      error.gate = gate.name;
      error.passed = passed;
      throw error;
    }
    passed.push(gate.name);
  }
  logger.log(`\nAll ${gates.length} release gates passed.`);
  return passed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: node scripts/automation/run-release-gates.mjs (no skip or scope options)');
    runReleaseGates();
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode || 1;
  }
}
