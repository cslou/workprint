import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { root } from './environment.js';

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
