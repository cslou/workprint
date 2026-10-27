import { spawnSync } from 'node:child_process';
import { compileTests } from './compile-tests.mjs';

const status = compileTests();
if (status !== 0) process.exit(status);
const result = spawnSync(process.execPath, ['apps/api/.test-build/test/local-supabase.js', '--setup'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
