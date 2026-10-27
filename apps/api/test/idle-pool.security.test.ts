import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { environment, root, sentinel } from './environment.js';
import { isolatedPostgres } from './postgres.js';
import { command } from './process.js';

test('native caller-owned pool survives real idle termination and replaces the connection for native reads', { timeout: 120000 }, async (t) => {
  const fixture = await environment();
  const db = await isolatedPostgres();
  try {
    await command(process.execPath, ['apps/api/.test-build/src/mastra/prepare.js'], {
      cwd: root, env: { ...fixture.env, MIGRATION_DATABASE_URL: db.setupUrl }, log: join(fixture.logs, 'prepare.log'),
    });
    await db.grantServing();
    const target = new URL(db.servingUrl);
    target.searchParams.set('application_name', sentinel);
    const child = fork(new URL('./idle-pool-worker.js', import.meta.url), [], {
      cwd: root, execPath: process.execPath, execArgv: [],
      env: { ...fixture.env, DATABASE_URL: target.href }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    const exited = new Promise<number | null>((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
    const ready = new Promise<unknown>((resolve) => child.once('message', resolve));
    const log = join(fixture.logs, 'idle-pool.log');
    let output = '';
    const discarded = new Promise<void>((resolve) => child.stderr!.on('data', (data: Buffer) => {
      appendFileSync(log, data);
      output += data.toString();
      if (output.includes('Native storage idle connection lost')) resolve();
    }));
    try {
      const first = await Promise.race([ready, exited.then((code) => { throw new Error(`Native composition exited before readiness (${code}); see ${log}`); })]) as { kind: string; pid: number };
      assert.equal(first.kind, 'ready');
      await db.terminateServingConnection(first.pid);
      await Promise.race([discarded, exited.then((code) => { throw new Error(`Idle connection error crashed native composition (${code}); see ${log}`); })]);
      const recovered = new Promise<unknown>((resolve) => child.once('message', resolve));
      child.send('recover');
      const result = await Promise.race([recovered, exited.then((code) => { throw new Error(`Native read failed after idle disconnect (${code}); see ${log}`); })]) as { kind: string; pid: number; threads: unknown[] };
      assert.equal(result.kind, 'recovered');
      assert.notEqual(result.pid, first.pid);
      assert.deepEqual(result.threads, []);
      assert.equal(await exited, 0);
      const captured = await readFile(log, 'utf8');
      assert.match(captured, /57P01/, 'Sanitized SQLSTATE retains useful failure context');
      for (const secret of [sentinel, db.servingUrl, new URL(db.servingUrl).password]) assert.ok(!captured.includes(secret));
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
    }
  } finally { await db.close(); }
  await fixture.noNetwork();
  t.diagnostic(`Evidence: ${fixture.logs}`);
});
