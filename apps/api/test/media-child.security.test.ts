import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { runMediaChild } from '../src/storage/media/child.js';

test('media child streams have hard independent caps, deadlines and explicit cancellation', { timeout: 10000 }, async () => {
  const run = (source: string, timeoutMs = 1000, signal?: AbortSignal) => runMediaChild(process.execPath, ['-e', source], { timeoutMs, ...(signal ? { signal } : {}) });
  const normal = await run("process.stdout.write('ok');process.stderr.write('diagnostic')");
  assert.equal(normal.stdout.toString(), 'ok'); assert.equal(normal.stderr.toString(), 'diagnostic');
  for (const stream of ['stdout', 'stderr']) await assert.rejects(run(`process.${stream}.write('x'.repeat(65537));setInterval(()=>{},1000)`), { code: 'output_limit' });
  await assert.rejects(run('setInterval(()=>{},1000)', 100), { code: 'deadline' });
  const controller = new AbortController(), pending = run('setInterval(()=>{},1000)', 2000, controller.signal); controller.abort();
  await assert.rejects(pending, { code: 'cancelled' });
  await assert.rejects(run("process.stderr.write('sensitive-control');process.exit(3)"), error => error instanceof Error && !error.message.includes('sensitive-control') && 'code' in error && error.code === 'failed');
  await assert.rejects(runMediaChild('/does-not-exist-owned-control', [], { timeoutMs: 1000 }), { code: 'unavailable' });
  await assert.rejects(runMediaChild('relative', [], { timeoutMs: 1000 }), { code: 'invalid_input' });
  await assert.rejects(runMediaChild(process.execPath, [], { timeoutMs: 30001 }), { code: 'invalid_input' });
  await assert.rejects(runMediaChild(process.execPath, [], { timeoutMs: 100, outputBytes: 65537 }), { code: 'invalid_input' });
  const literal = '$(must-not-execute); & |';
  const args = await runMediaChild(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', literal], { timeoutMs: 1000 }); assert.equal(args.stdout.toString(), literal);
});

test('media cancellation kills an inherited process group even after its leader exits', { timeout: 5000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'owned-media-child-')), file = join(directory, 'child.pid');
  const controller = new AbortController();
  const source = `const {spawn}=require('node:child_process'); const {writeFileSync}=require('node:fs'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'}); writeFileSync(${JSON.stringify(file)},String(child.pid)); process.exit(0);`;
  const pending = runMediaChild(process.execPath, ['-e', source], { timeoutMs: 2000, signal: controller.signal });
  const outcome = Promise.allSettled([pending]);
  try {
    let pid = 0; const deadline = Date.now() + 1000;
    while (!pid && Date.now() < deadline) { try { pid = Number(await readFile(file, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } if (!pid) await setImmediate(); }
    assert.ok(Number.isSafeInteger(pid) && pid > 1, 'The real owned descendant started before cancellation');
    controller.abort(); const [result] = await outcome; assert.equal(result!.status, 'rejected');
    if (result!.status === 'rejected') assert.equal((result!.reason as { code: string }).code, 'cancelled');
    let alive = true; const stopped = Date.now() + 1000;
    while (alive && Date.now() < stopped) { try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; alive = false; } if (alive) await setImmediate(); }
    assert.equal(alive, false, 'No inherited descendant survives observer cancellation');
  } finally { controller.abort(); await outcome; await rm(directory, { recursive: true }); }
});
