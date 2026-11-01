import { globSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Groups: `unit` needs no Docker; `integration` runs against one shared stack of Postgres, Auth and storage containers.
const group = process.argv[2];
if (group && !['unit', 'integration', 'compile'].includes(group)) throw new Error('Unknown test group');

// Never discover stale emitted cases from a different branch or removed source files.
for (const directory of ['apps/api/.test-build', 'apps/web/.test-build', 'packages/api-client/.test-build']) rmSync(directory, { recursive: true, force: true });
for (const project of ['packages/contracts/tsconfig.json', 'packages/api-client/tsconfig.json', 'packages/player/tsconfig.json', 'apps/api/tsconfig.json', 'packages/api-client/tsconfig.test.json', 'apps/web/tsconfig.test.json']) {
  const compiled = spawnSync('tsc', ['-p', project], { stdio: 'inherit' });
  if (compiled.status !== 0) process.exit(compiled.status ?? 1);
}
// Development fixtures need the same dependency-ordered compilation, not tests.
if (group === 'compile') process.exit(0);

// Every compiled test lands in a group: Docker-backed tests live under apps/api/test, all others are unit tests.
const compiled = globSync('{apps/api,apps/web,packages/api-client}/.test-build/**/*.test.js');
const integration = compiled.filter(file => file.startsWith('apps/api/.test-build/test/'));
const unit = compiled.filter(file => !integration.includes(file));
const files = group === 'unit' ? unit : group === 'integration' ? integration : [...unit, ...integration];
if (files.length === 0) throw new Error('No tests discovered');
const run = [process.execPath, '--test', '--test-concurrency=1', ...files];
// Integration files share one stack for the whole run; the launcher always removes it afterwards.
const command = files.some(file => integration.includes(file)) ? [process.execPath, 'scripts/test-stack.mjs', ...run] : run;
const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit' });
process.exit(result.status ?? 1);
