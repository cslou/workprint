import { spawnSync } from 'node:child_process';
import { spawn } from 'node:child_process';

const compile = spawnSync('tsc', ['-p', 'apps/api/tsconfig.json'], { stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const child = spawn(process.execPath, ['apps/api/.test-build/test/local-database.js'], { stdio: 'inherit' });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
