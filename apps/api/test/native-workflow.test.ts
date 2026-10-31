import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { nativeWorkflowFixture, workflowWatch } from './native-workflow-fixture.js';

test('built real Auth/Postgres native workflows retain independent identity and bounded execution', { timeout: 115000 }, async t => {
  const fixture = await nativeWorkflowFixture();
  t.diagnostic(`Evidence: ${fixture.logs}`);
  let stopped = false;
  const observations: (() => Promise<void>)[] = [];
  t.after(async () => {
    try { for (const close of observations) await close(); if (!stopped) await fixture.settleWorkflow(); }
    finally { await fixture.close(); }
  });
  const turn = async (who = 0) => {
    const thread = await fixture.thread(who), native = fixture.sdk(who);
    const scope = { threadId: thread.id, resourceId: fixture.users[who]!.id };
    const sub = await native.subscribeToThread({ ...scope, withInitialHistory: false });
    let closed = false;
    const pump = sub.processDataStream({ reconnect: false, onChunk: () => {} }).catch(error => { if (!closed) throw error; });
    const close = async () => { closed = true; sub.unsubscribe(); await pump; };
    observations.push(close);
    const sent = await native.sendMessage({ ...scope, message: 'Independent native workflow qualification', ifIdle: { behavior: 'wake' } });
    await fixture.wait(value => value.activeRuns.some(run => run.runId === sent.runId) && value.active > 0);
    return { native, scope, sent, close };
  };
  const completed = (runId: string) => fixture.waitWorkflow(async () => (await fixture.savedWorkflow(runId)).status === 'success');
  const clean = async () => { for (const close of observations) await close(); await fixture.settleWorkflow(); };

  await t.test('exact native turn Stop preserves the same separately started workflow and its subsequent saved progress', async () => {
    try {
      const active = await turn();
      const runId = await fixture.startWorkflow();
      await fixture.waitWorkflow(value => value.gates.includes(runId));
      const signal = active.sent.signal; assert.ok(signal && typeof signal === 'object' && 'id' in signal);
      assert.notEqual(runId, active.sent.runId); assert.notEqual(runId, signal.id);
      const pool = await fixture.idleWorkflowPool();
      t.diagnostic(`Native pool during external wait ${JSON.stringify(pool)}`);
      const before = await fixture.savedWorkflow(runId);
      assert.equal(before.status, 'running'); assert.equal(before.resourceId, fixture.users[0]!.id);
      assert.equal((await active.native.abortThread({ ...active.scope, expectedRunId: active.sent.runId, clearPendingSignals: false })).aborted, true);
      assert.equal((await fixture.savedWorkflow(runId)).status, 'running');
      assert.ok((await fixture.workflowState()).gates.includes(runId));
      await fixture.workflowControl('release', runId); await completed(runId);
      assert.deepEqual((await fixture.savedWorkflow(runId)).result, { progress: 2 });
      assert.equal((await fixture.workflowRows()).filter(row => row.runId === runId).length, 1);
    } finally { await clean(); }
  });
  await t.test('observer disconnect is neither turn Stop nor workflow cancellation', async () => {
    try {
      const active = await turn(1); const runId = await fixture.startWorkflow('held', 1);
      await fixture.waitWorkflow(value => value.gates.includes(runId));
      const aborts = (await fixture.state()).aborts.length;
      await active.close();
      await fixture.wait(value => value.observers === 0 && value.pumps === 0 && value.metadataObservers === 0);
      assert.equal((await fixture.state()).aborts.length, aborts); assert.equal((await fixture.state()).active, 1);
      assert.equal((await fixture.savedWorkflow(runId)).status, 'running');
      assert.ok((await fixture.workflowState()).gates.includes(runId));
      await fixture.workflowControl('release', runId, 1); await completed(runId);
      assert.deepEqual((await fixture.savedWorkflow(runId)).result, { progress: 2 });
      for (const id of (await fixture.state()).providerGates) await fixture.release(id);
      await fixture.wait(value => !value.activeRuns.length);
      assert.equal((await fixture.read(active.scope.threadId, 1)).messages.filter(message => message.role === 'assistant').length, 1);
    } finally { await clean(); }
  });
  await t.test('two actual runs fill admission; excess/foreign/invalid work does nothing and exact old cancellation cannot affect a replacement', async () => {
    try {
      const active = await turn();
      const [first, other] = await Promise.all([fixture.startWorkflow(), fixture.startWorkflow('held', 1)]);
      await fixture.waitWorkflow(value => value.active === 2);
      const before = await fixture.workflowState(), rows = (await fixture.workflowRows()).length;
      assert.equal(before.budget.active, 2); await fixture.idleWorkflowPool();
      const excess = await fixture.workflowRequest({ action: 'start', kind: 'held' });
      assert.equal(excess.status, 429, 'Excess work is rejected before native run creation, never queued');
      assert.deepEqual(await excess.json(), { error: { code: 'capacity_exceeded' } });
      for (const [body, who, status] of [
        [{ action: 'cancel', runId: first }, 1, 404],
        [{ action: 'read', runId: other }, 0, 404],
        [{ action: 'release', runId: other }, 0, 404],
        [{ action: 'resume', runId: other }, 0, 404],
        [{ action: 'cancel', runId: randomUUID() }, 0, 404],
        [{ action: 'cancel', runId: 'not-a-run' }, 0, 400],
        [{ action: 'cancel' }, 0, 400],
        [{ action: 'cancel', runId: first, resourceId: fixture.users[1]!.id }, 0, 400],
        [{ action: 'start', kind: 'held', resourceId: fixture.users[1]!.id }, 0, 400],
        [{ action: 'start', kind: 'held', waitMs: 5001 }, 0, 400],
      ] as const) assert.equal((await fixture.workflowRequest(body, who)).status, status);
      assert.equal((await fixture.workflowRequest({ action: 'start', kind: 'held' }, 0, false)).status, 401);
      assert.equal((await fixture.workflowRows()).length, rows); assert.equal((await fixture.workflowState()).entered, before.entered);
      assert.equal((await fixture.savedWorkflow(first)).status, 'running'); assert.equal((await fixture.savedWorkflow(other)).status, 'running');
      const cancelAt = performance.now(); await fixture.workflowControl('cancel', first);
      await fixture.waitWorkflow(value => value.active === 1 && !value.gates.includes(first));
      assert.ok(performance.now() - cancelAt < 1500); assert.equal((await fixture.savedWorkflow(first)).status, 'canceled');
      assert.equal((await fixture.savedWorkflow(other)).status, 'running');
      assert.ok((await fixture.state()).activeRuns.some(run => run.runId === active.sent.runId));
      assert.equal((await fixture.state()).active, 1, 'Workflow cancel did not Stop the unrelated turn');
      const replacement = await fixture.startWorkflow(); await fixture.waitWorkflow(value => value.active === 2);
      await fixture.workflowControl('cancel', first);
      assert.ok((await fixture.workflowState()).gates.includes(replacement)); assert.ok((await fixture.workflowState()).gates.includes(other));
      assert.equal((await fixture.workflowState()).budget.active, 2);
      await fixture.workflowControl('release', other, 1); await fixture.workflowControl('release', replacement);
      await completed(other); await completed(replacement);
      assert.equal((await fixture.workflowState()).budget.peak, 2);
    } finally { await clean(); }
  });
  await t.test('native suspension/resumption persists the same run and terminal failure is honestly saved', async () => {
    try {
      const runId = await fixture.startWorkflow('suspend');
      await fixture.waitWorkflow(async () => (await fixture.savedWorkflow(runId)).status === 'suspended');
      assert.equal((await fixture.workflowState()).budget.active, 1);
      const count = (await fixture.workflowRows()).length;
      await fixture.workflowControl('resume', runId); await completed(runId);
      assert.equal((await fixture.savedWorkflow(runId)).runId, runId); assert.deepEqual((await fixture.savedWorkflow(runId)).result, { progress: 2 });
      assert.equal((await fixture.workflowRows()).length, count);
      const failed = await fixture.startWorkflow('failure');
      await fixture.waitWorkflow(async () => (await fixture.savedWorkflow(failed)).status === 'failed');
      assert.equal((await fixture.savedWorkflow(failed)).errorName, 'Error'); assert.equal((await fixture.savedWorkflow(failed)).result, undefined);
    } finally { await clean(); }
  });
  await t.test('five-second external-wait stall saves failure, releases actual handles/capacity and admits later work', async () => {
    try {
      const started = performance.now(), runId = await fixture.startWorkflow();
      await workflowWatch(fixture.waitWorkflow(async () => (await fixture.savedWorkflow(runId)).status === 'failed', 6500), 7000);
      const elapsed = performance.now() - started; assert.ok(elapsed >= 4800 && elapsed < 6500, `Fixture wait: ${elapsed} ms`);
      const value = await fixture.workflowState(); assert.equal(value.active, 0); assert.equal(value.listeners, 0); assert.equal(value.timers, 0); assert.equal(value.budget.active, 0);
      assert.ok(value.events.some(event => event.runId === runId && event.kind === 'wait-timeout'));
      const replacement = await fixture.startWorkflow('sleep', 0, 50); await completed(replacement);
      t.diagnostic(`Native external wait ${elapsed.toFixed(3)} ms; saved failed; actual handles zero; replacement succeeded`);
    } finally { await clean(); }
  });
  await t.test('unresumed native suspension is canceled within the five-second fixture wait bound', async () => {
    try {
      const started = performance.now(), runId = await fixture.startWorkflow('suspend');
      await workflowWatch(fixture.waitWorkflow(async () => (await fixture.savedWorkflow(runId)).status === 'canceled', 6500), 7000);
      const elapsed = performance.now() - started; assert.ok(elapsed >= 4800 && elapsed < 6500);
      assert.equal((await fixture.workflowState()).budget.active, 0);
      const replacement = await fixture.startWorkflow('sleep', 0, 50); await completed(replacement);
      t.diagnostic(`Native suspended wait ${elapsed.toFixed(3)} ms; saved canceled; capacity released`);
    } finally { await clean(); }
  });
  await t.test('public exact cancellation of a natively waiting run prevents later progress without altering its saved canceled outcome', async () => {
    try {
      const runId = await fixture.startWorkflow('sleep', 0, 650);
      await fixture.waitWorkflow(async () => (await fixture.savedWorkflow(runId)).status === 'waiting');
      await fixture.idleWorkflowPool();
      await fixture.workflowControl('cancel', runId); await delay(800);
      assert.equal((await fixture.savedWorkflow(runId)).status, 'canceled');
      assert.equal((await fixture.workflowState()).events.filter(event => event.runId === runId && event.kind === 'native-progress' && event.progress === 1).length, 0);
    } finally { await clean(); }
  });
  await t.test('one ten-second run deadline cancels a longer native sequence, releases capacity and prevents late completion', async () => {
    try {
      const started = performance.now(), runId = await fixture.startWorkflow('deadline');
      await fixture.waitWorkflow(async () => (await fixture.savedWorkflow(runId)).status === 'waiting');
      const pool = await fixture.idleWorkflowPool();
      t.diagnostic(`Native pool during native wait ${JSON.stringify(pool)}`);
      await workflowWatch(fixture.waitWorkflow(async () => (await fixture.savedWorkflow(runId)).status === 'canceled', 11500), 12000);
      const elapsed = performance.now() - started; assert.ok(elapsed >= 9800 && elapsed < 11200, `Whole-run deadline: ${elapsed} ms`);
      assert.equal((await fixture.workflowState()).budget.active, 0); assert.equal((await fixture.workflowState()).budget.runExpired, 1);
      const replacement = await fixture.startWorkflow('sleep', 1, 50); await completed(replacement);
      await delay(Math.max(0, 12300 - (performance.now() - started)));
      assert.equal((await fixture.savedWorkflow(runId)).status, 'canceled');
      assert.equal((await fixture.workflowState()).events.filter(event => event.runId === runId && event.progress === 3).length, 0);
      t.diagnostic(`Native total run ${elapsed.toFixed(3)} ms; saved canceled; replacement succeeded; no late final step`);
    } finally { await clean(); }
  });
  await t.test('normal production excludes workflows/controls even with test-looking flags', async () => {
    await clean();
    const source = await readFile(join(fixture.logs, 'native-turn-http.log'), 'utf8');
    assert.doesNotMatch(source, /password|access_token|refresh_token/i);
    const production = await fixture.production(); stopped = true;
    for (const [path, body] of [
      ['/workflow-test/control', { action: 'start', kind: 'held' }], ['/workflow-test/state', undefined],
      ['/api/workflows/qualification-native-workflow/create-run', {}], ['/api/workflows/qualification-native-sleep/start', {}],
    ] as const) assert.equal((await production.request(path, body)).status, 404);
  });
});

test('SIGTERM settles two real native waits within seven seconds measured from the signal, saving exact cancellation', { timeout: 45000 }, async t => {
  const fixture = await nativeWorkflowFixture(); let stopped = false;
  t.diagnostic(`Evidence: ${fixture.logs}`);
  t.after(async () => { try { if (!stopped) await fixture.settleWorkflow(); } finally { await fixture.close(); } });
  const runs = await Promise.all([fixture.startWorkflow(), fixture.startWorkflow('held', 1)]);
  await fixture.waitWorkflow(value => value.active === 2 && value.budget.active === 2);
  await fixture.idleWorkflowPool();
  const result = await fixture.shutdown(); stopped = true;
  const saved = await Promise.all(runs.map(runId => fixture.savedWorkflow(runId)));
  t.diagnostic(JSON.stringify({ signalToExitMs: result.milliseconds, exitCode: result.code, savedStatuses: saved.map(row => row.status) }));
  assert.equal(result.code, 0, 'Native work settles before the independent watchdog; no harness kill');
  assert.ok(result.milliseconds >= 0 && result.milliseconds < 7500, `Signal-to-exit: ${result.milliseconds} ms`);
  for (const runId of runs) assert.equal((await fixture.savedWorkflow(runId)).status, 'canceled');
  assert.equal(await fixture.servingBusy(), 0); assert.equal(await fixture.servingConnections(), 0);
  const receipt = (await readFile(join(fixture.logs, 'native-turn-http.log'), 'utf8')).split('\n').find(line => line.startsWith('{"event":"native-workflow-settled"'));
  assert.ok(receipt); assert.deepEqual(JSON.parse(receipt), { event: 'native-workflow-settled', waits: 0, listeners: 0, timers: 0, permits: 0, budgetTimers: 0 });
  t.diagnostic(`SIGTERM signal-to-exit ${result.milliseconds.toFixed(3)} ms; both native states canceled; serving connections zero`);
});
