import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { compileTests } from './compile-tests.mjs';

const status = compileTests();
if (status !== 0) process.exit(status);
const group = process.argv[2];
if (group && !['smoke', 'security', 'native'].includes(group)) throw new Error('Unknown test group');
const files = globSync(`apps/api/.test-build/**/*.${group ? `${group}.` : ''}test.js`);
// The Auth/native ownership case belongs to both focused views, once in the aggregate.
if (group === 'security') files.push('apps/api/.test-build/test/conversations.native.test.js');
if (files.length === 0) throw new Error('No tests discovered');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
