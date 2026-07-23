import { execFileSync } from 'node:child_process';

const base = process.env.AUTOMATION_BASE_SHA || process.env.GITHUB_BASE_REF || 'origin/main';
const lane = String(process.env.AUTOMATION_LANE || '').trim().toLowerCase();

let files;
try {
  files = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
    .split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
} catch (error) {
  console.error(`Unable to audit automation diff from ${base}: ${error.message}`);
  process.exit(1);
}

const forbidden = files.filter((file) => (
  /(^|\/)(\.env|\.npmrc|id_rsa|credentials?)(\.|$)/i.test(file)
  || /service.account|secret/i.test(file)
  || file.startsWith('.git/')
));
if (forbidden.length) {
  console.error(`Automation diff contains forbidden sensitive paths: ${forbidden.join(', ')}`);
  process.exit(1);
}

if (files.length > 40) {
  console.error(`Automation diff changes ${files.length} paths; maximum unattended release size is 40.`);
  process.exit(1);
}

if (lane === 'weekly-pack') {
  const gameShells = files.filter((file) => /^[^/]+\/index\.html$/.test(file));
  if (gameShells.length > 3) {
    console.error(`Weekly pack changes ${gameShells.length} game shells; maximum is 3.`);
    process.exit(1);
  }
}

console.log(`Automation diff audit passed for ${files.length} path(s)${lane ? ` in ${lane} lane` : ''}.`);

