import { globSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

// Groups: `unit` (each package's test/unit) needs no Docker; `integration` (the rest of apps/api/test) runs against one shared stack of Postgres, Auth and storage containers.
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

// Tests live in each package's test/ folder, never beside source; every compiled test lands in exactly one group.
const misplaced = globSync('{apps,packages}/*/src/**/*.test.{ts,tsx}');
if (misplaced.length) throw new Error(`Tests belong in <package>/test/, not beside source: ${misplaced.join(', ')}`);
const compiled = globSync('{apps/api,apps/web,packages/api-client}/.test-build/**/*.test.js');
const unit = compiled.filter(file => file.includes('/.test-build/test/unit/'));
const integration = compiled.filter(file => file.startsWith('apps/api/.test-build/test/') && !unit.includes(file));
const orphaned = compiled.filter(file => !unit.includes(file) && !integration.includes(file));
if (orphaned.length) throw new Error(`Tests outside a known group: ${orphaned.join(', ')}`);
const files = group === 'unit' ? unit : group === 'integration' ? integration : [...unit, ...integration];
if (files.length === 0) throw new Error('No tests discovered');
const run = [process.execPath, '--test', '--test-concurrency=1', ...files];
// Integration files share one stack for the whole run; the launcher always removes it afterwards.
const command = files.some(file => integration.includes(file)) ? [process.execPath, 'scripts/test-stack.mjs', ...run] : run;
const child = spawn(command[0], command.slice(1), { stdio: 'inherit' });
// Stay until the child (and any stack teardown) has finished, even on Ctrl-C or a closed terminal.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
process.exit(await new Promise(done => child.on('exit', (code, signal) => done(code ?? (signal ? 1 : 0)))));
