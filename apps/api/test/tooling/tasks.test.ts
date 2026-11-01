import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { root } from '../support/environment.js';
import { command, start } from '../support/process.js';

test('root build forwards only explicit public Auth/API settings to Vite', { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workprint-public-build-'));
  const bin = join(dir, 'bin'), journal = join(dir, 'public.json');
  await mkdir(bin); await mkdir(join(dir, 'apps/web'), { recursive: true });
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  const values = { WORKPRINT_PUBLIC_API_ORIGIN: 'http://127.0.0.1:4111', WORKPRINT_PUBLIC_SUPABASE_URL: 'https://auth.example.test', WORKPRINT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'a'.repeat(24) };
  await writeFile(join(bin, 'tsc'), '#!' + process.execPath + '\n', { mode: 0o755 });
  await writeFile(join(bin, 'pnpm'), '#!' + process.execPath + '\n' + `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(journal)}, JSON.stringify({ public: Object.fromEntries(${JSON.stringify(Object.keys(values))}.map(key => [key, process.env[key]])), privatePresent: ['DATABASE_URL','SUPABASE_SECRET_KEY'].some(key => process.env[key]) }));`, { mode: 0o755 });
  await command(process.execPath, [join(root, 'scripts/tasks.mjs'), 'build'], { cwd: dir, env: { PATH: bin + ':' + process.env.PATH, ...values, DATABASE_URL: 'synthetic-private-setting', SUPABASE_SECRET_KEY: 'synthetic-private-setting' }, log: join(dir, 'build.log') });
  assert.deepEqual(JSON.parse(readFileSync(journal, 'utf8')), { public: values, privatePresent: false });
});

function killOwnedCompiler(pid: number) {
  try { process.kill(pid, 'SIGKILL'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

test('cancelling compilation cannot launch later build or setup stages, even if the compiler exits zero', { timeout: 60000 }, async (t) => {
  for (const task of ['build', 'db:prepare']) {
    for (const scenario of [{ exit: 0, cancel: true }, { exit: 7, cancel: true }, { exit: 7, cancel: false }]) {
      const compilerExit = scenario.exit;
      const dir = await mkdtemp(join(tmpdir(), 'workprint-cancel-'));
      const bin = join(dir, 'bin');
      const journal = join(dir, 'stages.log');
      await mkdir(bin);
      await mkdir(join(dir, 'apps/web'), { recursive: true });
      await writeFile(join(dir, 'package.json'), '{"type":"module"}');
      await writeFile(journal, '');
      const server = createServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      let compilerPid = 0;
      let controlSocket: Socket | undefined;
      const ready = new Promise<void>((resolve) => server.once('connection', (socket) => {
        controlSocket = socket;
        let handshake = '';
        socket.on('data', (data: Buffer) => {
          handshake += data.toString();
          if (handshake.includes('\n')) { compilerPid = Number(handshake.trim()); resolve(); }
        });
      }));
      const script = `#!${process.execPath}
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createConnection } from 'node:net';
const journal = ${JSON.stringify(journal)};
if (basename(process.argv[1]) !== 'tsc') { appendFileSync(journal, 'late stage\\n'); process.exit(0); }
mkdirSync('apps/api/dist/src/mastra', { recursive: true });
writeFileSync('apps/api/dist/src/mastra/prepare.js', ${JSON.stringify(`import { appendFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(journal)}, 'late setup\\n');`)});
setTimeout(() => process.exit(9), 10000).unref();
process.on('SIGINT', () => { appendFileSync(journal, 'compiler cancelled\\n'); process.exit(${compilerExit}); });
const socket = createConnection({ port: ${address.port}, host: '127.0.0.1' }, () => socket.write(String(process.pid) + '\\n'));
socket.on('data', () => { appendFileSync(journal, 'compiler failed\\n'); process.exit(7); });
`;
      for (const name of ['tsc', 'pnpm']) await writeFile(join(bin, name), script, { mode: 0o755 });
      const child = spawn(process.execPath, [join(root, 'scripts/tasks.mjs'), task], {
        cwd: dir, env: { PATH: `${bin}:${process.env.PATH}` }, stdio: ['ignore', 'ignore', 'pipe'],
      });
      const exited = new Promise<number | null>((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
      child.stderr.on('data', (data: Buffer) => appendFileSync(join(dir, 'task.log'), data));
      try {
        await Promise.race([ready, exited.then(() => { throw new Error('Task exited before compiler handshake'); })]);
        if (scenario.cancel) child.kill('SIGINT');
        else { assert.ok(controlSocket); controlSocket.write('fail'); }
        assert.equal(await exited, scenario.cancel ? 130 : 1, `${task}: cancelled/failed stage must settle unsuccessfully (${compilerExit})`);
        const stages = readFileSync(journal, 'utf8');
        assert.match(stages, scenario.cancel ? /compiler cancelled/ : /compiler failed/);
        assert.doesNotMatch(stages, /late/, `${task}: later stages must never launch (${compilerExit})`);
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        if (compilerPid) killOwnedCompiler(compilerPid);
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  }
  t.diagnostic('Compiler readiness and cancellation use a TCP handshake, not sleep timing');
});

const layeredKeys = ['DEFAULT_ASSISTANT_MODEL', 'META_API_KEY', 'DATABASE_URL', 'MIGRATION_DATABASE_URL', 'WORKPRINT_CANARY', 'WORKPRINT_PUBLIC_API_ORIGIN'];

/** A temp checkout whose stub tools record the env each serving/setup child receives. */
async function layeredCheckout() {
  const parent = await mkdtemp(join(tmpdir(), 'workprint-layered-'));
  // A .env above the working directory stands in for any other checkout's private file.
  await writeFile(join(parent, '.env'), 'WORKPRINT_CANARY=outer-canary\nMETA_API_KEY=outer-canary\n');
  const dir = join(parent, 'work'), bin = join(dir, 'bin'), journal = join(dir, 'journal');
  await mkdir(bin, { recursive: true }); await mkdir(journal); await mkdir(join(dir, 'apps/web'), { recursive: true });
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  await writeFile(join(dir, '.env'), 'DEFAULT_ASSISTANT_MODEL=meta/muse-spark-1.3\nMETA_API_KEY=layered-sentinel-key\nDATABASE_URL=postgresql://dotenv\nMIGRATION_DATABASE_URL=postgresql://dotenv-setup\nWORKPRINT_PUBLIC_API_ORIGIN=http://127.0.0.1:4111\n');
  await writeFile(join(dir, 'override.env'), 'DATABASE_URL=postgresql://override\nMIGRATION_DATABASE_URL=postgresql://override-setup\n');
  const recorder = (name: string) => `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(join(journal, name + '.json'))}, JSON.stringify(Object.fromEntries(${JSON.stringify(layeredKeys)}.map(key => [key, process.env[key]]))));`;
  // build would forward WORKPRINT_PUBLIC_API_ORIGIN to Vite if it loaded .env.
  // tsc stub recreates the compiled entry points that build/db:prepare delete first.
  await writeFile(join(bin, 'tsc'), `#!${process.execPath}\nimport { mkdirSync, writeFileSync } from 'node:fs';\nmkdirSync('apps/api/dist/src/mastra', { recursive: true });\nwriteFileSync('apps/api/dist/src/mastra/server.js', ${JSON.stringify(recorder('server'))});\nwriteFileSync('apps/api/dist/src/mastra/prepare.js', ${JSON.stringify(recorder('prepare'))});\n`, { mode: 0o755 });
  await writeFile(join(bin, 'pnpm'), `#!${process.execPath}\n${recorder('web')}\n`, { mode: 0o755 });
  await mkdir(join(dir, 'apps/api/dist/src/mastra'), { recursive: true });
  await writeFile(join(dir, 'apps/api/dist/src/mastra/server.js'), recorder('server'));
  return { dir, bin, journal };
}

async function recorded(journal: string, name: string) {
  const file = join(journal, name + '.json');
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { return JSON.parse(readFileSync(file, 'utf8')) as Record<string, string | undefined>; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  throw new Error(`No ${name} record`);
}

test('dev, start and db:prepare layer WORKPRINT_ENV_FILE over .env; the shell wins; build loads neither', { timeout: 60000 }, async () => {
  const expected = { DEFAULT_ASSISTANT_MODEL: 'meta/muse-spark-1.3', META_API_KEY: 'layered-sentinel-key', DATABASE_URL: 'postgresql://override' };
  for (const task of ['start', 'db:prepare', 'dev']) {
    const { dir, bin, journal } = await layeredCheckout();
    const env = { PATH: `${bin}:${process.env.PATH}`, HOME: process.env.HOME, WORKPRINT_ENV_FILE: 'override.env' };
    const running = await start(process.execPath, [join(root, 'scripts/tasks.mjs'), task], { cwd: dir, env, log: join(dir, 'task.log'), lifetimeMs: 30000 });
    try {
      const child = await recorded(journal, task === 'db:prepare' ? 'prepare' : 'server');
      // Recorded as JSON, so an absent key (such as the outer canary) is simply missing.
      const setup = task === 'db:prepare';
      // Setup receives the override's migration URL and the loaded public setting; serving children receive neither.
      assert.deepEqual(child, { ...expected, ...(setup ? { MIGRATION_DATABASE_URL: 'postgresql://override-setup', WORKPRINT_PUBLIC_API_ORIGIN: 'http://127.0.0.1:4111' } : {}) }, task);
      // The browser child gets only explicit public settings: never the model or the key.
      if (!setup) assert.deepEqual(await recorded(journal, 'web'), { WORKPRINT_PUBLIC_API_ORIGIN: 'http://127.0.0.1:4111' }, task);
    } finally { await running.stop(); }
  }
  const shell = await layeredCheckout();
  const running = await start(process.execPath, [join(root, 'scripts/tasks.mjs'), 'start'], { cwd: shell.dir, env: { PATH: `${shell.bin}:${process.env.PATH}`, WORKPRINT_ENV_FILE: 'override.env', DATABASE_URL: 'postgresql://shell' }, log: join(shell.dir, 'task.log'), lifetimeMs: 30000 });
  try { assert.equal((await recorded(shell.journal, 'server')).DATABASE_URL, 'postgresql://shell'); } finally { await running.stop(); }
  const build = await layeredCheckout();
  await command(process.execPath, [join(root, 'scripts/tasks.mjs'), 'build'], { cwd: build.dir, env: { PATH: `${build.bin}:${process.env.PATH}`, WORKPRINT_ENV_FILE: 'override.env' }, log: join(build.dir, 'build.log') });
  assert.deepEqual(await recorded(build.journal, 'web'), {});
});

test('a named WORKPRINT_ENV_FILE that does not exist fails before any child starts', { timeout: 30000 }, async () => {
  for (const task of ['start', 'db:prepare', 'dev']) {
    const { dir, bin, journal } = await layeredCheckout();
    const running = await start(process.execPath, [join(root, 'scripts/tasks.mjs'), task], { cwd: dir, env: { PATH: `${bin}:${process.env.PATH}`, WORKPRINT_ENV_FILE: 'missing.env' }, log: join(dir, 'task.log'), lifetimeMs: 20000 });
    try {
      assert.notEqual(await running.exited, 0, task);
      assert.deepEqual(readdirSync(journal), [], `${task}: no child may start`);
      assert.match(readFileSync(join(dir, 'task.log'), 'utf8'), /WORKPRINT_ENV_FILE not found/);
    } finally { await running.stop(); }
  }
});
