import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { nativeTurnFixture } from './native-turn-fixture.js';
import { workflowWatch } from './native-workflow-fixture.js';
import { recoveryBoundaries } from './native-recovery-store.js';
import { recoveryWorkflowName } from './native-recovery-definition.js';
import { terminalWorkflow, workflowSnapshot } from './native-workflow-outcome.js';

type Fixture = Awaited<ReturnType<typeof nativeTurnFixture>>;
const wait = async <T>(read: () => Promise<T | false | undefined>, milliseconds = 6500): Promise<T> => {
  const end = performance.now() + milliseconds;
  for (;;) { const value = await read(); if (value !== false && value !== undefined) return value; if (performance.now() >= end) throw new Error('Independent recovery watchdog exceeded'); await delay(20); }
};
const control = (fixture: Fixture, body: unknown, who = 0) => fixture.request('/recovery-test/control', body, who);
const rows = async (fixture: Fixture) => (await fixture.workflowRuns()).filter(row => row.workflowName === recoveryWorkflowName);
const saved = async (fixture: Fixture, id: string) => (await rows(fixture)).find(row => row.runId === id);
const runtime = async (fixture: Fixture) => {
  const response = await fixture.request('/recovery-test/state'); assert.equal(response.status, 200);
  return await response.json() as { pid: number; startupSweeps: number; startupSettled: number; inflight: number; budget: { active: number; timers: number; peak: number; rejected: number; errors: number; waitExpired: number; runExpired: number }; pool: { total: number; idle: number; waiting: number } };
};
const idle = async (fixture: Fixture) => {
  const value = await wait(async () => { const state = await runtime(fixture); return state.pool.total === state.pool.idle && !state.pool.waiting ? state : false; }, 1000);
  assert.equal(await fixture.servingBusy(), 0); return value.pool;
};
const settled = async (fixture: Fixture) => wait(async () => {
  const state = await runtime(fixture);
  return !state.budget.active && !state.budget.timers && !state.inflight && (await rows(fixture)).every(row => terminalWorkflow(workflowSnapshot(row).status)) ? state : false;
});
const buildIdentity = async (fixture: Fixture) => {
  const hashes = [];
  for (const name of ['turn-entry.mjs', 'src/mastra/server.js']) hashes.push(createHash('sha256').update(await readFile(join(fixture.logs, 'native-turns', name))).digest('hex'));
  for (const name of ['provider', 'definition', 'store', 'barrier']) hashes.push(createHash('sha256').update(await readFile(join(process.cwd(), 'apps/api/.test-build/test', `native-recovery-${name}.js`))).digest('hex'));
  return hashes;
};
const reconcile = async (fixture: Fixture, runId: string, who: number) => {
  const outcomes: unknown[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt === 1) {
      const ownership = await fixture.recoveryOwnership(runId);
      if (ownership?.leaseExpiresAt) {
        const remaining = Math.max(0, new Date(ownership.leaseExpiresAt).getTime() - Date.now() + 25);
        assert.ok(remaining <= 1200, 'Explicit hand-off waits only the observed one-second TEST lease, never an unbounded retry');
        await delay(remaining);
      }
    }
    const response = await control(fixture, { action: 'reconcile' }, who); assert.equal(response.status, 200);
    outcomes.push(await response.json());
  }
  return outcomes;
};

for (const [index, boundary] of recoveryBoundaries.entries()) test(`actual built SIGKILL/restart recovers the same intent/run at ${boundary}`, { timeout: 55000 }, async t => {
  const fixture = await nativeTurnFixture({ recovery: true });
  t.diagnostic(`Evidence: ${fixture.logs}`);
  t.after(async () => { try { await fixture.recoveryBarrier('released'); } finally { await fixture.close(); } });
  const identity = await buildIdentity(fixture), who = index % 2, logicalId = randomUUID();
  assert.equal(await fixture.recoveryPreparationDenied(), true);
  let conversation: { threadId: string; signalIds: string[] } | undefined;
  if (boundary === 'started-before-ack') {
    const thread = await fixture.thread(who);
    await fixture.sdk(who).sendMessage({ threadId: thread.id, resourceId: fixture.users[who]!.id, message: 'Do not replay this uncertain conversation command after process death', ifIdle: { behavior: 'wake' } });
    await wait(async () => (await fixture.state()).active > 0);
    const messages = (await fixture.read(thread.id, who)).messages;
    conversation = { threadId: thread.id, signalIds: messages.filter(message => message.role === 'signal').map(message => message.id) };
    assert.equal(conversation.signalIds.length, 1);
  }
  await fixture.recoveryBarrier(boundary);
  const beforePid = (await runtime(fixture)).pid;
  const pending = control(fixture, { action: 'start', logicalId, boundary }, who).then(async response => ({ status: response.status, value: await response.json() as unknown }), () => ({ disconnected: true }));
  const intent = await wait(async () => (await fixture.recoveryIntents()).find(row => row.logicalId === logicalId));
  assert.equal(intent.resourceId, fixture.users[who]!.id);
  if (boundary === 'waiting') await wait(async () => {
    const row = await saved(fixture, intent.runId), snapshot = row && workflowSnapshot(row);
    return snapshot?.status === 'waiting' && snapshot.context['recovery-entered']?.status === 'success' && snapshot.context['recovery-sleep']?.status === 'waiting';
  });
  else await wait(async () => (await fixture.recoveryEvents()).some(event => event.pid === beforePid && event.kind === 'barrier' && event.phase === boundary && event.runId === intent.runId));
  const before = await saved(fixture, intent.runId);
  if (boundary === 'committed-before-start') assert.equal(before, undefined);
  else { assert.ok(before); assert.equal(before.resourceId, intent.resourceId); assert.ok(['running', 'waiting'].includes(workflowSnapshot(before).status)); }
  if (boundary === 'effect-before-step-ack') assert.equal((await fixture.recoveryEffects()).length, 1);
  await idle(fixture);
  const killed = await fixture.crash(); assert.equal(killed.pid, beforePid); assert.equal(killed.signal, 'SIGKILL'); assert.equal(killed.code, null);
  const receipt = await pending;
  if (boundary === 'committed-before-start' || boundary === 'started-before-ack') assert.deepEqual(receipt, { disconnected: true });
  await fixture.recoveryBarrier('released');
  const recoveryStarted = performance.now(), restartedPid = await fixture.restart(); assert.notEqual(restartedPid, beforePid);
  assert.deepEqual(await buildIdentity(fixture), identity, 'Exact same compiled entry/bootstrap and retained database');
  await wait(async () => (await runtime(fixture)).startupSweeps === 1, 1000);
  assert.equal((await runtime(fixture)).startupSweeps, 1, 'Real app-owned startup invokes/delegates exactly one native sweep');
  const reconciliations = await reconcile(fixture, intent.runId, who);
  const after = await wait(async () => { const row = await saved(fixture, intent.runId); return row && terminalWorkflow(workflowSnapshot(row).status) ? row : false; });
  assert.equal(workflowSnapshot(after).status, 'success'); assert.equal(after.runId, intent.runId); assert.equal(after.resourceId, intent.resourceId);
  const history = workflowSnapshot(after).context;
  for (const step of ['recovery-entered', 'recovery-sleep', 'recovery-effect']) assert.equal(history[step]?.status, 'success');
  assert.equal((await rows(fixture)).length, 1, 'No additional native run, including failed stray runs');
  assert.deepEqual(await fixture.recoveryEffects(), [{ logical_id: logicalId, run_id: intent.runId }]);
  assert.equal((await fixture.recoveryIntents()).length, 1); assert.equal((await fixture.recoveryIntents())[0]!.runId, intent.runId);
  const events = (await fixture.recoveryEvents()).filter(event => event.runId === intent.runId);
  if (boundary === 'started-before-ack') assert.ok(events.some(event => event.kind === 'entered' && event.pid === restartedPid));
  if (boundary === 'effect-before-step-ack') {
    assert.deepEqual(events.filter(event => event.kind === 'effect').map(event => event.inserted), [1, 0], 'Actual guarded SQL effect re-entry, not exactly-once execution');
    assert.equal(new Set(events.filter(event => event.kind === 'effect-entry').map(event => event.pid)).size, 2);
  }
  const state = await settled(fixture); assert.equal(state.budget.errors, 0); const pool = await idle(fixture);
  assert.ok(Date.now() - intent.committedAt.getTime() < 10000, 'Original whole-run budget, not a fresh restart budget');
  const recoveryMs = performance.now() - recoveryStarted;
  const replayChecks: { phase: string; pid: number; calls: number; active: number; inputIdsUnchanged: boolean }[] = [];
  const noReplay = async (phase: string) => {
    await wait(async () => (await runtime(fixture)).startupSettled === 1, 10000);
    const processState = await runtime(fixture), model = await fixture.state();
    let inputIdsUnchanged = true;
    if (conversation) {
      const ids = (await fixture.read(conversation.threadId, who)).messages.filter(message => message.role === 'signal').map(message => message.id);
      inputIdsUnchanged = JSON.stringify(ids) === JSON.stringify(conversation.signalIds);
      assert.deepEqual(ids, conversation.signalIds);
    }
    const receipt = { phase, pid: processState.pid, calls: model.calls, active: model.active, inputIdsUnchanged };
    t.diagnostic(JSON.stringify({ noReplayProcess: receipt }));
    assert.equal(model.calls, 0, 'Every recovered process must make zero conversation/model calls, including replay of an existing signal');
    assert.equal(model.active, 0, 'Every recovered process must have no active replay');
    replayChecks.push(receipt);
  };
  await noReplay('first-recovered-before-second-kill');
  const secondKill = await fixture.crash(); assert.equal(secondKill.signal, 'SIGKILL'); await fixture.restart();
  await reconcile(fixture, intent.runId, who); await settled(fixture);
  assert.equal((await rows(fixture)).length, 1); assert.equal((await fixture.recoveryEffects()).length, 1);
  assert.deepEqual(await buildIdentity(fixture), identity);
  await noReplay('second-recovered');
  const shutdown = await fixture.stopServing(); assert.equal(shutdown.code, 0); assert.equal(shutdown.signal, null); assert.ok(shutdown.milliseconds < 7500);
  assert.equal(await fixture.servingConnections(), 0);
  t.diagnostic(JSON.stringify({ boundary, logicalId, runId: intent.runId, killedPid: beforePid, restartedPid, signal: killed.signal, nativeBefore: before ? workflowSnapshot(before).status : null,
    nativeAfter: workflowSnapshot(after).status, nativeRows: 1, effects: 1, recoveryMs, pool, guardedInserts: events.filter(event => event.kind === 'effect').map(event => event.inserted), reconciliations, buildHashes: identity, replayChecks, shutdown }));
});

test('actual restart restores two permits and only the original remaining wait/run budgets', { timeout: 55000 }, async t => {
  const fixture = await nativeTurnFixture({ recovery: true });
  t.diagnostic(`Evidence: ${fixture.logs}`);
  t.after(async () => { try { await fixture.recoveryBarrier('released'); } finally { await fixture.close(); } });
  await fixture.recoveryBarrier('started-before-ack'); const started = performance.now();
  const pending = [0, 1].map(who => control(fixture, { action: 'start', logicalId: randomUUID(), boundary: 'started-before-ack' }, who).then(() => 'acknowledged', () => 'disconnected'));
  await wait(async () => (await fixture.recoveryEvents()).filter(event => event.kind === 'entered').length === 2 && (await runtime(fixture)).budget.active === 2);
  assert.equal((await control(fixture, { action: 'start', logicalId: randomUUID(), boundary: 'waiting' })).status, 429);
  assert.equal((await fixture.recoveryIntents()).length, 2); assert.equal((await rows(fixture)).length, 2);
  const foreign = (await fixture.recoveryIntents()).find(intent => intent.resourceId === fixture.users[0]!.id)!;
  assert.equal((await control(fixture, { action: 'cancel', logicalId: foreign.logicalId }, 1)).status, 404);
  await delay(Math.max(0, 2800 - (performance.now() - started)));
  await fixture.crash(); assert.deepEqual(await Promise.all(pending), ['disconnected', 'disconnected']); await fixture.restart();
  const primed = await runtime(fixture); assert.equal(primed.budget.active, 2); assert.equal(primed.budget.timers, 4);
  await wait(async () => (await rows(fixture)).every(row => workflowSnapshot(row).status === 'canceled'), Math.max(1, 6400 - (performance.now() - started)));
  const elapsed = performance.now() - started; assert.ok(elapsed >= 4800 && elapsed < 6400, `Original recovered wait ${elapsed} ms`);
  const state = await settled(fixture); assert.equal(state.budget.waitExpired, 2); assert.equal(state.budget.runExpired, 0); assert.equal(state.budget.errors, 0);
  assert.equal((await fixture.recoveryEffects()).length, 0); await idle(fixture);
  await fixture.recoveryBarrier('released');
  const later = await control(fixture, { action: 'start', logicalId: randomUUID(), boundary: 'committed-before-start' }); assert.equal(later.status, 200);
  await settled(fixture); assert.equal((await fixture.recoveryEffects()).length, 1);
  const shutdown = await fixture.stopServing(); assert.equal(shutdown.code, 0); assert.equal(shutdown.signal, null); assert.ok(shutdown.milliseconds < 7500);
  assert.equal(await fixture.servingConnections(), 0);
  t.diagnostic(JSON.stringify({ originalRecoveredWaitMs: elapsed, restoredPermits: primed.budget.active, waitExpired: state.budget.waitExpired, runExpired: state.budget.runExpired, replacementEffects: 1, shutdown }));
});

test('real progressing native work retains its original ten-second deadline across SIGKILL/restart', { timeout: 55000 }, async t => {
  const fixture = await nativeTurnFixture({ recovery: true }); t.diagnostic(`Evidence: ${fixture.logs}`);
  t.after(fixture.close);
  const logicalId = randomUUID(), started = performance.now();
  assert.equal((await control(fixture, { action: 'start', logicalId, boundary: 'run-deadline' })).status, 200);
  const intent = (await fixture.recoveryIntents())[0]!;
  await wait(async () => {
    const row = await saved(fixture, intent.runId), snapshot = row && workflowSnapshot(row);
    return snapshot?.status === 'waiting' && snapshot.context['recovery-midpoint']?.status === 'success' && snapshot.context['recovery-sleep-two']?.status === 'waiting';
  });
  const killed = await fixture.crash(); await fixture.restart();
  const primed = await runtime(fixture); assert.equal(primed.budget.active, 1); assert.equal(primed.budget.timers, 2);
  await reconcile(fixture, intent.runId, 0);
  await wait(async () => { const row = await saved(fixture, intent.runId); return row && workflowSnapshot(row).status === 'canceled'; }, Math.max(1, 11200 - (performance.now() - started)));
  const elapsed = performance.now() - started; assert.ok(elapsed >= 9800 && elapsed < 11200, `Original recovered run budget ${elapsed} ms`);
  const state = await settled(fixture); assert.equal(state.budget.runExpired, 1); assert.equal(state.budget.waitExpired, 0);
  assert.equal((await rows(fixture)).length, 1); assert.equal((await fixture.recoveryEffects()).length, 0);
  assert.equal((await fixture.recoveryIntents())[0]!.runDeadline.getTime(), intent.runDeadline.getTime());
  await idle(fixture); await delay(Math.max(0, 12300 - (performance.now() - started)));
  assert.equal(workflowSnapshot((await saved(fixture, intent.runId))!).status, 'canceled');
  assert.equal((await fixture.recoveryEffects()).length, 0, 'No late effect after final native sleep');
  const shutdown = await fixture.stopServing(); assert.equal(shutdown.code, 0); assert.equal(shutdown.signal, null); assert.ok(shutdown.milliseconds < 7500);
  assert.equal(await fixture.servingConnections(), 0);
  t.diagnostic(JSON.stringify({ originalRecoveredRunMs: elapsed, signal: killed.signal, nativeRows: 1, effects: 0, runExpired: state.budget.runExpired, waitExpired: state.budget.waitExpired, shutdown }));
});

test('actual app startup native sweep alone recovers or honestly cancels within the original wait budget', { timeout: 45000 }, async t => {
  const fixture = await nativeTurnFixture({ recovery: true });
  t.diagnostic(`Evidence: ${fixture.logs}`);
  t.after(async () => { try { await fixture.recoveryBarrier('released'); } finally { await fixture.close(); } });
  const logicalId = randomUUID(); await fixture.recoveryBarrier('effect-before-step-ack');
  const pending = control(fixture, { action: 'start', logicalId, boundary: 'effect-before-step-ack' }).then(() => 'acknowledged', () => 'disconnected');
  const intent = await wait(async () => (await fixture.recoveryIntents()).find(value => value.logicalId === logicalId));
  await wait(async () => (await fixture.recoveryEvents()).some(event => event.runId === intent.runId && event.kind === 'barrier' && event.phase === 'effect-before-step-ack'));
  const hashes = await buildIdentity(fixture), killed = await fixture.crash(); await pending;
  await fixture.recoveryBarrier('released'); const pid = await fixture.restart(); assert.notEqual(pid, killed.pid);
  assert.deepEqual(await buildIdentity(fixture), hashes);
  // No explicit reconciliation/restart call: delegate the real boot sweep and its native lease recheck.
  const row = await wait(async () => { const value = await saved(fixture, intent.runId); return value && terminalWorkflow(workflowSnapshot(value).status) ? value : false; });
  assert.ok(['success', 'canceled'].includes(workflowSnapshot(row).status));
  const state = await settled(fixture); assert.equal(state.startupSweeps, 1); assert.equal(state.budget.errors, 0);
  if (workflowSnapshot(row).status === 'canceled') assert.equal(state.budget.waitExpired, 1);
  assert.ok(Date.now() - intent.committedAt.getTime() < 6400);
  assert.equal((await rows(fixture)).length, 1); assert.equal((await fixture.recoveryEffects()).length, 1);
  await idle(fixture);
  const shutdown = await fixture.stopServing(); assert.equal(shutdown.code, 0); assert.equal(shutdown.signal, null); assert.ok(shutdown.milliseconds < 7500);
  assert.equal(await fixture.servingConnections(), 0);
  t.diagnostic(JSON.stringify({ automaticNativeSweep: state.startupSweeps, explicitReconciliations: 0, nativeStatus: workflowSnapshot(row).status, guardedInserts: (await fixture.recoveryEvents()).filter(event => event.kind === 'effect').map(event => event.inserted), effects: 1, shutdown }));
});

test('normal built production excludes recovery fixtures and intent controls despite test-looking flags', { timeout: 45000 }, async t => {
  const fixture = await nativeTurnFixture({ recovery: true }); t.after(fixture.close);
  assert.equal((await control(fixture, { action: 'start', logicalId: randomUUID(), boundary: 'waiting', resourceId: fixture.users[0]!.id })).status, 400);
  assert.equal((await fixture.recoveryIntents()).length, 0);
  const production = await fixture.production();
  for (const [path, body] of [
    ['/recovery-test/control', { action: 'start', logicalId: randomUUID(), boundary: 'waiting' }], ['/recovery-test/state', undefined],
    ['/api/workflows/qualification-native-recovery/create-run', {}],
  ] as const) assert.equal((await production.request(path, body)).status, 404);
  assert.equal((await fixture.recoveryIntents()).length, 0); assert.equal((await rows(fixture)).length, 0); assert.equal((await fixture.recoveryEffects()).length, 0);
});

test('each accepted concurrent start completes its own committed hand-off despite an older account snapshot', { timeout: 45000 }, async t => {
  const fixture = await nativeTurnFixture({ recovery: true }); t.diagnostic(`Evidence: ${fixture.logs}`);
  t.after(async () => { try { await fixture.recoveryBarrier('released'); } finally { await fixture.close(); } });
  const firstLogical = randomUUID(), secondLogical = randomUUID();
  const firstResponse = await control(fixture, { action: 'start', logicalId: firstLogical, boundary: 'waiting' }); assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json() as { runId: string; records: { runId: string }[] };
  await fixture.recoveryBarrier('reconcile-listed');
  const older = control(fixture, { action: 'reconcile' });
  await wait(async () => (await fixture.recoveryEvents()).some(event => event.kind === 'barrier' && event.phase === 'reconcile-listed' && event.runId === first.runId));
  const secondPending = control(fixture, { action: 'start', logicalId: secondLogical, boundary: 'waiting' });
  const secondIntent = await wait(async () => (await fixture.recoveryIntents()).find(intent => intent.logicalId === secondLogical));
  await fixture.recoveryBarrier('released');
  const secondResponse = await secondPending; assert.equal(secondResponse.status, 200);
  const second = await secondResponse.json() as { runId: string; records: { runId: string }[] };
  const olderResponse = await older; assert.equal(olderResponse.status, 200); await olderResponse.json();
  t.diagnostic(JSON.stringify({ concurrentHandoff: { firstRunId: first.runId, secondRunId: secondIntent.runId, firstRecords: first.records.map(row => row.runId), secondRecords: second.records.map(row => row.runId) } }));
  assert.equal(second.runId, secondIntent.runId); assert.notEqual(first.runId, second.runId);
  assert.deepEqual(first.records.map(row => row.runId), [first.runId]);
  assert.deepEqual(second.records.map(row => row.runId), [secondIntent.runId], 'An accepted start cannot acknowledge only an older intent snapshot');
  await wait(async () => (await rows(fixture)).length === 2 && (await rows(fixture)).every(row => workflowSnapshot(row).status === 'success'));
  await settled(fixture); assert.equal((await fixture.recoveryEffects()).length, 2); assert.equal((await fixture.recoveryIntents()).length, 2);
  const state = await runtime(fixture); assert.equal(state.budget.peak, 2); assert.equal(state.budget.errors, 0); await idle(fixture);
  const shutdown = await fixture.stopServing(); assert.equal(shutdown.code, 0); assert.equal(shutdown.signal, null); assert.ok(shutdown.milliseconds < 7500);
  assert.equal(await fixture.servingConnections(), 0);
  t.diagnostic(JSON.stringify({ concurrentHandoffComplete: true, nativeRows: 2, effects: 2, shutdown }));
});

for (const failure of ['none', 'save', 'readback'] as const) test(`SIGTERM while actual recovered native work is active preserves saved cancellation honesty (${failure})`, { timeout: 55000 }, async t => {
  const fixture = await nativeTurnFixture({ recovery: true }); t.diagnostic(`Evidence: ${fixture.logs}`);
  t.after(async () => {
    try { await fixture.workflowReadability(true); await fixture.workflowPersistence(true); await fixture.recoveryBarrier('released'); }
    finally { await fixture.close(); }
  });
  await fixture.recoveryBarrier('effect-before-step-ack');
  const starts = await Promise.all([0, 1].map(who => control(fixture, { action: 'start', logicalId: randomUUID(), boundary: 'effect-before-step-ack' }, who)));
  for (const response of starts) { assert.equal(response.status, 200); await response.json(); }
  const intents = await fixture.recoveryIntents(); assert.equal(intents.length, 2);
  await wait(async () => (await fixture.recoveryEvents()).filter(event => event.kind === 'barrier' && event.phase === 'effect-before-step-ack').length === 2);
  const killed = await fixture.crash(); assert.equal(killed.signal, 'SIGKILL'); const pid = await fixture.restart(); assert.notEqual(pid, killed.pid);
  const owners = await Promise.all(intents.map(intent => fixture.recoveryOwnership(intent.runId)));
  const expires = Math.max(Date.now(), ...owners.map(owner => owner?.leaseExpiresAt?.getTime() ?? 0));
  assert.ok(expires - Date.now() <= 1200); await delay(Math.max(0, expires - Date.now() + 25));
  const recovering = [0, 1].map(who => control(fixture, { action: 'reconcile' }, who).then(async response => ({ status: response.status, body: await response.json() as unknown }), () => ({ disconnected: true })));
  await wait(async () => {
    const events = await fixture.recoveryEvents();
    return intents.every(intent => events.some(event => event.pid === pid && event.runId === intent.runId && event.kind === 'barrier' && event.phase === 'effect-before-step-ack'));
  });
  const before = await runtime(fixture), beforeRows = await rows(fixture);
  assert.equal(before.budget.active, 2); assert.ok(before.inflight > 0); assert.equal(beforeRows.length, 2);
  assert.ok(beforeRows.every(row => workflowSnapshot(row).status === 'running'));
  await idle(fixture);
  if (failure === 'save') await fixture.workflowPersistence(false);
  if (failure === 'readback') await fixture.workflowReadability(false);
  const shutdown = await workflowWatch(fixture.stopServing(), 9000); await Promise.all(recovering);
  const afterRows = await rows(fixture), statuses = afterRows.map(row => workflowSnapshot(row).status);
  const log = await readFile(join(fixture.logs, 'native-turn-http.log'), 'utf8');
  const receipt = log.split('\n').find(line => line.startsWith('{"event":"native-recovery-settled"'));
  t.diagnostic(JSON.stringify({ recoveredActiveShutdown: failure, signal: killed.signal, recoveredPid: pid, activeBefore: before.budget.active, inflightBefore: before.inflight, statuses, shutdown, settledReceipt: Boolean(receipt) }));
  assert.equal(shutdown.signal, null, 'No watchdog/forced SIGKILL is successful shutdown evidence'); assert.ok(shutdown.milliseconds < 7500);
  assert.equal(await fixture.servingConnections(), 0); assert.equal(afterRows.length, 2); assert.deepEqual(afterRows.map(row => row.runId).sort(), intents.map(intent => intent.runId).sort());
  if (failure === 'none') {
    assert.equal(shutdown.code, 0); assert.deepEqual(statuses, ['canceled', 'canceled']); assert.ok(receipt);
    const value = JSON.parse(receipt) as { active: number; timers: number; errors: number; inflight: number };
    assert.equal(value.active, 0); assert.equal(value.timers, 0); assert.equal(value.errors, 0); assert.equal(value.inflight, 0);
    const events = await fixture.recoveryEvents();
    assert.ok(intents.every(intent => events.some(event => event.pid === pid && event.runId === intent.runId && event.kind === 'barrier-exit' && event.phase === 'effect-before-step-ack')));
  } else {
    assert.equal(shutdown.code, 1); assert.deepEqual(statuses, ['running', 'running']); assert.equal(receipt, undefined, 'No settled receipt on unconfirmed save/readback');
  }
});
