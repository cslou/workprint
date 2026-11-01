import { globSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Never discover stale emitted cases from a different branch or removed source files.
rmSync('apps/api/.test-build', { recursive: true, force: true });
const contracts = spawnSync('tsc', ['-p', 'packages/contracts/tsconfig.json'], { stdio: 'inherit' });
if (contracts.status !== 0) process.exit(contracts.status ?? 1);
const client = spawnSync('tsc', ['-p', 'packages/api-client/tsconfig.json'], { stdio: 'inherit' });
if (client.status !== 0) process.exit(client.status ?? 1);
const player = spawnSync('tsc', ['-p', 'packages/player/tsconfig.json'], { stdio: 'inherit' });
if (player.status !== 0) process.exit(player.status ?? 1);
const compile = spawnSync('tsc', ['-p', 'apps/api/tsconfig.json'], { stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const group = process.argv[2];
// Development fixtures need the same dependency-ordered compilation, not tests.
if (group === 'compile') process.exit(0);
if (group) throw new Error('Unknown test group');
const files = globSync('apps/api/.test-build/**/*.test.js');
if (files.length === 0) throw new Error('No tests discovered');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
