import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { nativeWorkflowFixture, workflowWatch } from './native-workflow-fixture.js';

type Fixture = Awaited<ReturnType<typeof nativeWorkflowFixture>>;
const states = async (fixture: Fixture, runs: string[]) => Promise.all(runs.map(async id => (await fixture.savedWorkflow(id)).status));
const suspended = async (fixture: Fixture) => {
  const runs = await Promise.all([fixture.startWorkflow('suspend'), fixture.startWorkflow('suspend', 1)]);
  await fixture.waitWorkflow(async value => value.budget.active === 2 && (await states(fixture, runs)).every(status => status === 'suspended'));
  return runs;
};

for (const boundary of ['explicit', 'wait-deadline', 'run-deadline', 'shutdown'] as const) test(`real PG cancellation-save failure is unconfirmed at ${boundary}, never released or reported settled`, { timeout: 45000 }, async t => {
  const fixture = await nativeWorkflowFixture(); let stopped = false;
  t.diagnostic(`Evidence: ${fixture.logs}`);
  t.after(async () => {
    try { if (!stopped) await fixture.shutdown(); }
    finally { try { await fixture.workflowPersistence(true); } finally { await fixture.close(); } }
  });
  const runs = boundary === 'run-deadline'
    ? await Promise.all([fixture.startWorkflow('deadline'), fixture.startWorkflow('deadline', 1)])
    : await suspended(fixture);
  if (boundary === 'run-deadline') await workflowWatch(fixture.waitWorkflow(async value => {
    if (value.events.filter(event => runs.includes(event.runId) && event.progress === 2).length !== 2) return false;
    const rows = await Promise.all(runs.map(id => fixture.savedWorkflow(id)));
    return rows.every(row => row.status === 'waiting' && row.steps['deadline-second']?.status === 'success');
  }, 9500), 10000);
  const count = (await fixture.workflowRows()).length;
  await fixture.idleWorkflowPool();
  await fixture.workflowPersistence(false);
  if (boundary === 'explicit') {
    const response = await fixture.workflowRequest({ action: 'cancel', runId: runs[0] });
    t.diagnostic(JSON.stringify({ boundary, httpStatus: response.status, savedStatuses: await states(fixture, runs), permits: (await fixture.workflowState()).budget.active }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: 'native_cancellation_unconfirmed' } });
  } else if (boundary === 'wait-deadline' || boundary === 'run-deadline') {
    await workflowWatch(fixture.waitWorkflow(value => value.budget.errors >= 2, boundary === 'wait-deadline' ? 6500 : 3500), boundary === 'wait-deadline' ? 7000 : 4000);
    assert.equal((await fixture.workflowState()).budget.active, 2, 'Unconfirmed native save cannot release admission');
    t.diagnostic(JSON.stringify({ boundary, savedStatuses: await states(fixture, runs), budget: (await fixture.workflowState()).budget }));
  }
  if (boundary !== 'shutdown') {
    assert.equal((await fixture.workflowState()).budget.active, 2);
    assert.equal((await fixture.workflowRequest({ action: 'start', kind: 'held' })).status, 429);
    assert.equal((await fixture.workflowRows()).length, count, 'No native row for excess work');
  }
  const result = await fixture.shutdown(); stopped = true;
  const savedStatuses = await states(fixture, runs);
  t.diagnostic(JSON.stringify({ boundary, signalToExitMs: result.milliseconds, exitCode: result.code, savedStatuses }));
  assert.equal(result.code, 1, 'Persistence uncertainty must not exit successfully');
  assert.ok(result.milliseconds < 7500, 'Signal-to-exit remains within the one total deadline under an independent watchdog');
  assert.deepEqual(savedStatuses, boundary === 'run-deadline' ? ['waiting', 'waiting'] : ['suspended', 'suspended']);
  const log = await readFile(join(fixture.logs, 'native-turn-http.log'), 'utf8');
  assert.doesNotMatch(log, /"event":"native-workflow-settled"/, 'No false settled receipt');
  assert.equal(await fixture.servingConnections(), 0);
});

for (const boundary of ['createRun', 'resume'] as const) test(`real PG ${boundary} failure preserves the original five-second suspension deadline`, { timeout: 45000 }, async t => {
  const fixture = await nativeWorkflowFixture({ workflowResumeBoundary: boundary });
  t.diagnostic(`Evidence: ${fixture.logs}`);
  t.after(async () => {
    try {
      await fixture.releaseWorkflowResume();
      await fixture.workflowReadability(true); await fixture.workflowPersistence(true);
      await fixture.settleWorkflow();
    } finally { await fixture.close(); }
  });
  const started = performance.now(), runId = await fixture.startWorkflow('suspend');
  await fixture.waitWorkflow(async value => value.budget.timers === 2 && (await fixture.savedWorkflow(runId)).status === 'suspended');
  await delay(2600); // Age the original wait budget: restarting five seconds must fail this test.
  const pending = fixture.workflowRequest({ action: 'resume', runId });
  await fixture.waitWorkflow(() => fixture.workflowResumeReached(), 1000);
  if (boundary === 'createRun') await fixture.workflowReadability(false);
  else await fixture.workflowPersistence(false);
  await fixture.releaseWorkflowResume();
  const response = await pending;
  await fixture.workflowReadability(true); await fixture.workflowPersistence(true);
  assert.equal(response.status, 500, 'Actual native persistence/handle acquisition fails, not a fabricated adapter result');
  assert.equal((await fixture.savedWorkflow(runId)).status, 'suspended');
  assert.equal((await fixture.workflowState()).entered, 1, 'Failed resume never re-enters the native step');
  await fixture.idleWorkflowPool();
  const log = await readFile(join(fixture.logs, 'native-turn-http.log'), 'utf8');
  assert.match(log, /permission denied for table/);
  const remaining = Math.max(1, 6400 - (performance.now() - started));
  await workflowWatch(fixture.waitWorkflow(async () => (await fixture.savedWorkflow(runId)).status === 'canceled', remaining), remaining + 200);
  const elapsed = performance.now() - started, state = await fixture.workflowState();
  assert.ok(elapsed >= 4800 && elapsed < 6400, `Original suspension deadline: ${elapsed} ms`);
  assert.equal(state.budget.waitExpired, 1); assert.equal(state.budget.runExpired, 0);
  assert.equal(state.budget.active, 0); assert.equal(state.budget.timers, 0); assert.equal(state.budget.errors, 0);
  assert.equal((await fixture.savedWorkflow(runId)).runId, runId);
  await fixture.releasedWorkflow(); await fixture.idleWorkflowPool();
  t.diagnostic(JSON.stringify({ resumeBoundary: boundary, httpStatus: response.status, originalWaitElapsedMs: elapsed, status: 'canceled', budget: state.budget }));
});

test('actual native resumed work outlives the original suspension deadline without cancellation or a borrowed pool client', { timeout: 45000 }, async t => {
  const fixture = await nativeWorkflowFixture();
  t.diagnostic(`Evidence: ${fixture.logs}`);
  t.after(async () => { try { await fixture.settleWorkflow(); } finally { await fixture.close(); } });
  const started = performance.now(), runId = await fixture.startWorkflow('suspend-held');
  await fixture.waitWorkflow(async value => value.budget.timers === 2 && (await fixture.savedWorkflow(runId)).status === 'suspended');
  await delay(2600);
  const pending = fixture.workflowRequest({ action: 'resume', runId });
  await fixture.waitWorkflow(value => value.gates.includes(runId) && value.entered === 2);
  await delay(Math.max(0, 5350 - (performance.now() - started)));
  assert.equal((await fixture.savedWorkflow(runId)).status, 'running');
  const state = await fixture.workflowState();
  assert.equal(state.budget.waitExpired, 0); assert.equal(state.budget.runExpired, 0);
  assert.equal(state.budget.active, 1); assert.equal(state.budget.timers, 1, 'Only the unchanged whole-run deadline remains');
  const pool = await fixture.idleWorkflowPool();
  await fixture.workflowControl('release', runId);
  assert.equal((await pending).status, 200);
  await fixture.releasedWorkflow();
  assert.equal((await fixture.savedWorkflow(runId)).status, 'success');
  assert.deepEqual((await fixture.savedWorkflow(runId)).result, { progress: 2 });
  t.diagnostic(JSON.stringify({ resumedPastOriginalWaitMs: performance.now() - started, status: 'success', pool, waitExpired: state.budget.waitExpired }));
});
