import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Runs a command against one shared test stack (Postgres, Auth, object storage) and always removes the stack afterwards.
// Needs compiled fixtures: `node scripts/test.mjs compile`.
const command = process.argv.slice(2);
if (!command.length) throw new Error('Usage: node scripts/test-stack.mjs <command> [args...]');

const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const run = env => new Promise((done, fail) => {
  const child = spawn(command[0], command.slice(1), { stdio: 'inherit', env });
  const forward = signal => child.kill(signal);
  for (const signal of signals) process.on(signal, forward);
  child.on('error', fail);
  child.on('exit', (code, signal) => {
    for (const name of signals) process.off(name, forward);
    done(code ?? (signal ? 1 : 0));
  });
});

// An enclosing launcher already owns a stack; reuse it.
if (process.env.WORKPRINT_TEST_STACK) process.exit(await run(process.env));

const { startTestStack } = await import(pathToFileURL(resolve('apps/api/.test-build/test/support/test-stack.js')).href);
const previewPort = process.env.WORKPRINT_PREVIEW_PORT ?? '4180';
// Stop requests during startup abort it at the next step; startup releases whatever was acquired.
const startup = new AbortController();
const interrupt = () => startup.abort();
for (const signal of signals) process.on(signal, interrupt);
let stack;
try {
  stack = await startTestStack({ browserOrigins: [`http://127.0.0.1:${previewPort}`], signal: startup.signal });
} catch (error) {
  // Only a clean abort; a failed release still surfaces as the startup error.
  if (error !== startup.signal.reason) throw error;
  console.error('Test stack startup interrupted; acquired resources were released');
  process.exit(1);
}
let status = 1;
try {
  if (!startup.signal.aborted) status = await run({ ...process.env, WORKPRINT_TEST_STACK: stack.file });
} finally {
  await stack.close();
}
process.exit(status);
