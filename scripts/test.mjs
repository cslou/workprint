import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const compile = spawnSync('tsc', ['-p', 'apps/api/tsconfig.json'], { stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const group = process.argv[2];
if (group && !['smoke', 'security'].includes(group)) throw new Error('Unknown test group');
const files = globSync(`apps/api/.test-build/**/*.${group ? `${group}.` : ''}test.js`);
if (files.length === 0) throw new Error('No tests discovered');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
