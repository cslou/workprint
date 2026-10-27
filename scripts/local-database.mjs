import { spawn } from 'node:child_process';
import { compileTests } from './compile-tests.mjs';

const status = compileTests();
if (status !== 0) process.exit(status);
const child = spawn(process.execPath, ['apps/api/.test-build/test/local-database.js'], { stdio: 'inherit' });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
