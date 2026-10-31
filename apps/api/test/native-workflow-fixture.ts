import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { nativeControlFixture } from './native-control-fixture.js';
import type { NativeWorkflowState } from './native-workflow-definition.js';
import { workflowFixtureNames, workflowRecord, workflowSnapshot } from './native-workflow-provider.js';
import { terminalWorkflow } from './native-workflow-outcome.js';

type RuntimeState = NativeWorkflowState & { pid: number; pool: { total: number; idle: number; waiting: number } };

export { terminalWorkflow } from './native-workflow-outcome.js';
export async function workflowWatch<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Independent workflow watchdog exceeded')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

export async function nativeWorkflowFixture() {
  const fixture = await nativeControlFixture({ workflows: true });
  const state = async () => {
    const response = await fixture.request('/workflow-test/state'); assert.equal(response.status, 200);
    const value = await response.json() as RuntimeState;
    for (const count of [value.active, value.listeners, value.timers, value.entered, value.aborted, value.timedOut, value.budget.active, value.budget.timers, value.budget.errors, value.pool.total, value.pool.idle, value.pool.waiting]) assert.ok(Number.isSafeInteger(count) && count >= 0);
    assert.ok(Number.isSafeInteger(value.pid) && value.pid > 0); return value;
  };
  const request = (body: unknown, who = 0, authenticated = true) => fixture.request('/workflow-test/control', body, who, authenticated);
  const control = async (action: 'cancel' | 'resume' | 'release' | 'read', runId: string, who = 0) => {
    const response = await request({ action, runId }, who); assert.equal(response.status, 200);
    return response.json();
  };
  const rows = async () => (await fixture.workflowRuns()).filter(row => workflowFixtureNames.some(name => row.workflowName === name));
  const saved = async (runId: string) => { const row = (await rows()).find(row => row.runId === runId); if (!row) throw new Error('Saved native workflow missing'); return workflowRecord(row); };
  const wait = async (predicate: (value: RuntimeState) => boolean | Promise<boolean>, milliseconds = 2500) => {
    const end = performance.now() + milliseconds;
    for (;;) { const value = await state(); if (await predicate(value)) return value; if (performance.now() >= end) throw new Error('Native workflow state watchdog exceeded'); await delay(20); }
  };
  const idlePool = async () => {
    const value = await wait(value => value.pool.total === value.pool.idle && value.pool.waiting === 0, 1000);
    assert.equal(await fixture.servingBusy(), 0); return value.pool;
  };
  const start = async (kind: 'held' | 'suspend' | 'failure' | 'sleep' | 'deadline' = 'held', who = 0, waitMs?: number) => {
    const response = await request({ action: 'start', kind, ...(waitMs === undefined ? {} : { waitMs }) }, who); assert.equal(response.status, 200);
    const value = await response.json() as { runId: string; resourceId: string; ack: { runId: string } };
    assert.equal(value.resourceId, fixture.users[who]!.id); assert.equal(value.ack.runId, value.runId); return value.runId;
  };
  const released = async () => {
    await wait(async value => !value.active && !value.listeners && !value.timers && !value.gates.length && !value.budget.active && !value.budget.timers && (await rows()).every(row => terminalWorkflow(workflowSnapshot(row).status)), 6500);
    assert.equal((await state()).budget.errors, 0);
    await fixture.wait(value => !value.active && !value.listeners && !value.timers && !value.observers && !value.pumps && !value.held && !value.heldListeners && !value.metadataObservers && !value.streamSubscriptions && !value.activeRuns.length, 8500);
    assert.equal(await fixture.servingBusy(), 0);
  };
  const settle = async () => {
    await fixture.unblock();
    for (const row of await rows()) if (!terminalWorkflow(workflowSnapshot(row).status)) {
      const who = fixture.users.findIndex(user => user.id === row.resourceId); assert.notEqual(who, -1);
      await control('cancel', row.runId, who);
    }
    for (const id of (await fixture.state()).providerGates) await fixture.release(id);
    await released();
  };
  const shutdown = async () => {
    const pid = (await state()).pid;
    const started = performance.now();
    process.kill(pid, 'SIGTERM');
    const code = await workflowWatch(fixture.exited, 9000);
    return { code, milliseconds: performance.now() - started };
  };
  return { ...fixture, workflowState: state, workflowRequest: request, workflowControl: control, workflowRows: rows, savedWorkflow: saved,
    waitWorkflow: wait, idleWorkflowPool: idlePool, startWorkflow: start, releasedWorkflow: released, settleWorkflow: settle, shutdown };
}
export type NativeWorkflowFixture = Awaited<ReturnType<typeof nativeWorkflowFixture>>;
