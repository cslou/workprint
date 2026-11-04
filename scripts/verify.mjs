import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';

const suite = process.argv[2];
if (!['quick', 'standard', 'e2e'].includes(suite) || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/verify.mjs quick|standard|e2e');
}
process.chdir(fileURLToPath(new URL('../', import.meta.url)));

// The first check compiles fresh tests; subsequent steps reuse that output.
const steps = [['pnpm', 'check'], ['pnpm', 'test:unit']];
if (suite !== 'quick') steps.push(['pnpm', 'build'], ['pnpm', 'test:tooling']);
if (suite === 'e2e') steps.push(
  [process.execPath, 'scripts/test-stack.mjs', 'sh', '-c',
    'node scripts/test.mjs integration && playwright test --config test/e2e/playwright.config.ts'],
  [process.execPath, 'scripts/audit.mjs'],
);

let interrupted;
let active;
let killTimer;
function signalGroup(pid, signal) {
  try { process.kill(-pid, signal); return true; }
  catch (error) { if (error.code !== 'ESRCH') throw error; return false; }
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (interrupted) return;
    interrupted = signal;
    if (!active?.pid) return;
    const pid = active.pid;
    // Build tasks handle TERM/INT and own detached compilers; HUP would kill the owner first.
    signalGroup(pid, signal === 'SIGHUP' ? 'SIGTERM' : signal);
    // Give fixture owners time to clean up before forcing an interrupted group down.
    killTimer = setTimeout(() => signalGroup(pid, 'SIGKILL'), 40_000);
    killTimer.unref();
  });
}

async function run(command, args, env) {
  console.info(`\n> ${[command, ...args].join(' ')}`);
  const child = spawn(command, args, { env, stdio: 'inherit', detached: true });
  active = child;
  let failure;
  try {
    const status = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
    if (interrupted || status !== 0) throw new Error(`${command} ${args.join(' ')} ${interrupted ? `interrupted by ${interrupted}` : `failed (${status})`}`);
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(killTimer);
    active = undefined;
    // Only signal this invocation's group. Never clean up another checkout's processes.
    if (child.pid && signalGroup(child.pid, 0)) {
      signalGroup(child.pid, 'SIGTERM');
      for (let attempt = 0; attempt < 100 && signalGroup(child.pid, 0); attempt++) await delay(50);
      if (signalGroup(child.pid, 0)) signalGroup(child.pid, 'SIGKILL');
      failure ??= new Error(`${command} left background processes; verification failed`);
    }
  }
  if (failure) throw failure;
}

try {
  const env = { ...process.env };
  delete env.WORKPRINT_TESTS_COMPILED;
  for (const [command, ...args] of steps) {
    if (interrupted) throw new Error(`Verification interrupted by ${interrupted}`);
    await run(command, args, env);
    env.WORKPRINT_TESTS_COMPILED = '1';
  }
  console.info(`\nVerification completed: ${suite}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
