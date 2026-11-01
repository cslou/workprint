import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Runs a command against one shared test stack (Postgres, Auth, object storage) and always removes the stack afterwards.
// Needs compiled fixtures: `node scripts/test.mjs compile`.
const command = process.argv.slice(2);
if (!command.length) throw new Error('Usage: node scripts/test-stack.mjs <command> [args...]');

const run = env => new Promise((done, fail) => {
  const child = spawn(command[0], command.slice(1), { stdio: 'inherit', env });
  const forward = signal => child.kill(signal);
  process.on('SIGINT', forward); process.on('SIGTERM', forward);
  child.on('error', fail);
  child.on('exit', (code, signal) => {
    process.off('SIGINT', forward); process.off('SIGTERM', forward);
    done(code ?? (signal ? 1 : 0));
  });
});

// An enclosing launcher already owns a stack; reuse it.
if (process.env.WORKPRINT_TEST_STACK) process.exit(await run(process.env));

const { startTestStack } = await import(pathToFileURL(resolve('apps/api/.test-build/test/support/test-stack.js')).href);
const previewPort = process.env.WORKPRINT_PREVIEW_PORT ?? '4180';
// Stop requests during startup still release whatever was acquired.
let interrupted = false;
const interrupt = () => { interrupted = true; };
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
const stack = await startTestStack({ browserOrigins: [`http://127.0.0.1:${previewPort}`] });
let status = 1;
try {
  if (!interrupted) status = await run({ ...process.env, WORKPRINT_TEST_STACK: stack.file });
} finally {
  await stack.close();
}
process.exit(status);
