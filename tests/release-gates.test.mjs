import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { RELEASE_SCRIPTS, resolveNpmCli, runReleaseGates } from '../scripts/automation/run-release-gates.mjs';

const silent = { log() {} };

test('release gates run every required check in order without a shell', () => {
  const calls = [];
  const passed = runReleaseGates({ root: process.cwd(), npmCli: 'C:/Node with spaces/npm-cli.js', logger: silent,
    run(command, args, options) { calls.push({ command, args, options }); return { status: 0 }; },
  });
  assert.deepEqual(passed, ['maintenance:validate', 'game:preflight', 'test:telemetry', 'test:feedback', 'test:shop', 'test:social', 'git diff --check']);
  for (const [index, call] of calls.entries()) {
    assert.equal(call.options.shell, false);
    assert.equal(call.options.windowsHide, true);
    if (index < RELEASE_SCRIPTS.length) {
      assert.equal(call.command, process.execPath);
      assert.deepEqual(call.args, ['C:/Node with spaces/npm-cli.js', 'run', RELEASE_SCRIPTS[index]]);
    } else {
      assert.equal(call.command, 'git');
      assert.deepEqual(call.args, ['diff', '--check']);
    }
  }
});

for (const failure of [{ status: 7 }, { status: null, signal: 'SIGTERM' }, { status: null, error: new Error('ENOENT') }, { status: null }]) {
  test(`a failed or unlaunched gate stops without retrying: ${failure.error?.message || failure.signal || failure.status}`, () => {
    let calls = 0;
    assert.throws(() => runReleaseGates({ npmCli: '/npm-cli.js', logger: silent, run() { calls++; return calls === 2 ? failure : { status: 0 }; } }), error => {
      assert.equal(error.gate, 'game:preflight');
      assert.deepEqual(error.passed, ['maintenance:validate']);
      assert.equal(error.exitCode, failure.status || 1);
      return true;
    });
    assert.equal(calls, 2);
  });
}

test('missing npm fails before checks and malformed npm_execpath falls back to installed npm', () => {
  assert.throws(() => resolveNpmCli({ env: {}, execPath: '/no-node-here/node', platform: 'win32' }), /Cannot locate npm-cli/);
  assert.match(resolveNpmCli({ env: { ...process.env, npm_execpath: '/no-npm-here.js' } }), /npm-cli\.js$/);
});

test('real npm works with spaces and stops on a script failure without PowerShell', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release gates with spaces '));
  const npmCli = resolveNpmCli();
  try {
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ scripts: Object.fromEntries(RELEASE_SCRIPTS.map(name => [name, `node gate.cjs ${name}`])) }));
    fs.writeFileSync(path.join(directory, 'gate.cjs'), `const fs = require('node:fs'); const name = process.argv[2]; fs.appendFileSync('executed.txt', name + '\\n'); if (name === 'test:feedback' && fs.existsSync('fail')) process.exit(9);`);
    assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: directory, windowsHide: true }).status, 0);
    const quietRun = (command, args, options) => spawnSync(command, args, { ...options, stdio: 'pipe' });
    assert.equal(runReleaseGates({ root: directory, npmCli, run: quietRun, logger: silent }).length, 7);
    assert.deepEqual(fs.readFileSync(path.join(directory, 'executed.txt'), 'utf8').trim().split('\n'), RELEASE_SCRIPTS);
    fs.writeFileSync(path.join(directory, 'executed.txt'), '');
    fs.writeFileSync(path.join(directory, 'fail'), '');
    assert.throws(() => runReleaseGates({ root: directory, npmCli, run: quietRun, logger: silent }), error => error.gate === 'test:feedback' && error.exitCode === 9);
    assert.deepEqual(fs.readFileSync(path.join(directory, 'executed.txt'), 'utf8').trim().split('\n'), RELEASE_SCRIPTS.slice(0, 4));
  } finally {
    assert.ok(directory.startsWith(path.join(os.tmpdir(), 'release gates with spaces ')));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
