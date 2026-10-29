import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const task = process.argv[2];
if (!['build', 'dev', 'start', 'db:prepare'].includes(task)) throw new Error('Unknown task');
const envFile = process.env.WORKPRINT_ENV_FILE ?? '.env';
if (task !== 'build' && existsSync(envFile)) process.loadEnvFile(envFile);
const env = {
  ...process.env,
  MASTRA_TELEMETRY_DISABLED: '1',
  MASTRA_OFFLINE: '1',
  MASTRA_SKIP_DOTENV: '1',
};
const serving = { ...env };
delete serving.MIGRATION_DATABASE_URL;
delete serving.WORKPRINT_PUBLIC_API_ORIGIN;
// Only this explicit public origin may cross into Vite; never backend settings.
const webEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT', 'NODE_OPTIONS', 'WORKPRINT_PUBLIC_API_ORIGIN'].filter((key) => env[key]).map((key) => [key, env[key]]));
const children = new Set();
let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  const signalGroup = (child, value) => {
    if (!child.pid) return;
    try { process.kill(-child.pid, value); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  const owned = [...children];
  for (const child of owned) signalGroup(child, signal);
  const timer = setTimeout(() => { for (const child of owned) signalGroup(child, 'SIGKILL'); }, 5000);
  timer.unref();
}
process.on('SIGINT', () => { process.exitCode = 130; stop('SIGINT'); });
process.on('SIGTERM', () => { process.exitCode = 143; stop(); });
function run(command, args, cwd = '.', childEnv = env) {
  if (stopping) return Promise.reject(new Error('Task stopped; no further stages may launch'));
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: childEnv, stdio: 'inherit', detached: true });
    children.add(child);
    child.once('error', (error) => { children.delete(child); reject(error); });
    child.once('exit', (code, signal) => {
      children.delete(child);
      if (stopping) reject(new Error(`Task stopped while running ${command}`));
      else if (code === 0) resolve();
      else reject(new Error(`${command} failed (${code ?? signal})`));
    });
  });
}
try {
  if (task === 'build' || task === 'db:prepare') {
    await run('tsc', ['-p', 'packages/contracts/tsconfig.json']);
    await run('tsc', ['-p', 'packages/api-client/tsconfig.json']);
    await run('tsc', ['-p', 'packages/player/tsconfig.json']);
    rmSync('apps/api/dist', { recursive: true, force: true });
    await run('tsc', ['-p', 'apps/api/tsconfig.build.json']);
  }
  if (task === 'build') {
    await run('pnpm', ['exec', 'vite', 'build'], 'apps/web', webEnv);
  } else if (task === 'db:prepare') {
    await run(process.execPath, ['dist/src/mastra/prepare.js'], 'apps/api');
  } else {
    if (task === 'dev') {
      await run('tsc', ['-p', 'packages/contracts/tsconfig.json']);
      await run('tsc', ['-p', 'packages/api-client/tsconfig.json']);
      await run('tsc', ['-p', 'packages/player/tsconfig.json']);
      await run('tsc', ['-p', 'apps/api/tsconfig.build.json']);
    }
    await Promise.all([
      ...(task === 'dev' ? [run('tsc', ['-p', 'apps/api/tsconfig.build.json', '--watch', '--preserveWatchOutput'], '.', serving)] : []),
      run(process.execPath, [...(task === 'dev' ? ['--watch'] : []), 'apps/api/dist/src/mastra/server.js'], '.', serving),
      run('pnpm', ['exec', 'vite', ...(task === 'start' ? ['preview'] : []), '--host', '127.0.0.1', '--port', process.env.WEB_PORT ?? '5173', '--strictPort'], 'apps/web', webEnv),
    ]);
  }
} catch (error) {
  stop();
  console.error(error.message);
  process.exitCode ||= 1;
}
