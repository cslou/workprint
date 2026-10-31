import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createApiClient, type NativeRunObservation, type NativeObservation } from '@workprint/api-client';
import { nativeControlFixture, settleNativeControl, withinFiveSeconds } from './native-control-fixture.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('api-client independently queues, reconnects and conditionally stops exact native executions', { timeout: 120000 }, async t => {
  const fixture = await nativeControlFixture(); t.after(fixture.close);
  for (const who of [0, 1]) await t.test(`account ${who}: exact native outcomes and authoritative reload`, async () => {
    const client = createApiClient({ baseUrl: fixture.origin, getAccessToken: () => fixture.accessToken(who) });
    const thread = await fixture.thread(who), scope = { threadId: thread.id, resourceId: fixture.users[who]!.id };
    const initial = await fixture.state(); const opened: (NativeRunObservation | NativeObservation)[] = [];
    try {
      const firstObserver = await client.native.subscribe(scope); assert.ok(firstObserver.ok); opened.push(firstObserver.value);
      const first = await client.native.sendText({ ...scope, message: 'Exact facade active input' }); assert.ok(first.ok);
      const cancelled = firstObserver.value.consumeTurn(first.value.runId, () => {});
      await fixture.wait(s => s.calls === initial.calls + 1 && s.active === 1);
      const second = await client.native.queueText({ ...scope, message: 'Exact facade queued input two' }); assert.ok(second.ok);
      const third = await client.native.queueText({ ...scope, message: 'Exact facade queued input three' }); assert.ok(third.ok);
      firstObserver.value.close(); const cancellation = await withinFiveSeconds(cancelled); assert.ok(!cancellation.ok && cancellation.error.code === 'cancelled');
      const disconnected = await fixture.wait(s => !s.observers && !s.pumps); assert.equal(disconnected.active, 1); assert.equal(disconnected.aborts.length, initial.aborts.length);
      const reconnected = await client.native.observeTurn({ runId: first.value.runId }); assert.ok(reconnected.ok); opened.push(reconnected.value);
      reconnected.value.close(); await fixture.wait(s => s.metadataObservers === 0); assert.equal((await fixture.state()).active, 1); assert.equal((await fixture.state()).aborts.length, initial.aborts.length);
      const stopStart = performance.now(), stopped = await withinFiveSeconds(client.native.stop({ ...scope, runId: first.value.runId }));
      assert.ok(performance.now() - stopStart < 3000); assert.ok(stopped.ok); assert.deepEqual(stopped.value, { runId: first.value.runId, abortRequested: true });
      await fixture.wait(s => s.providerGates.includes(initial.calls + 2));
      const replay = await client.native.observeTurn({ runId: first.value.runId }); assert.ok(replay.ok); opened.push(replay.value);
      let partial = ''; const interrupted = await withinFiveSeconds(replay.value.consume(part => { assert.equal(part.runId, first.value.runId); partial += part.text; }));
      assert.ok(interrupted.ok && interrupted.value.outcome === 'interrupted'); assert.equal(partial, `Partial ${initial.calls + 1} `); assert.ok(interrupted.value.assistantMessageId);
      const beforeOld = await fixture.state();
      for (let n = 0; n < 2; n++) { const old = await client.native.stop({ ...scope, runId: first.value.runId }); assert.ok(old.ok && !old.value.abortRequested); }
      const afterOld = await fixture.state(); assert.equal(afterOld.cancelled, beforeOld.cancelled); assert.equal(afterOld.aborted, beforeOld.aborted); assert.ok(afterOld.providerGates.includes(initial.calls + 2));
      const foreign = createApiClient({ baseUrl: fixture.origin, getAccessToken: () => fixture.accessToken(1 - who) }); const hidden = await foreign.native.observeTurn({ runId: first.value.runId }); assert.ok(!hidden.ok && hidden.error.code === 'not_found');
      const next = await client.native.observeTurn({ runId: second.value.runId }); assert.ok(next.ok); opened.push(next.value); const nextDone = next.value.consume(() => {});
      const queued = await client.native.subscribe(scope); assert.ok(queued.ok); opened.push(queued.value); const queuedDone = queued.value.consumeTurn(third.value.runId, () => {});
      await fixture.release(initial.calls + 2); const completeSecond = await withinFiveSeconds(nextDone); assert.ok(completeSecond.ok && completeSecond.value.outcome === 'complete');
      await fixture.wait(s => s.providerGates.includes(initial.calls + 3)); await fixture.release(initial.calls + 3);
      const completeThird = await withinFiveSeconds(queuedDone); assert.ok(completeThird.ok && completeThird.value.outcome === 'complete');
      await fixture.wait(s => !s.active && !s.activeRuns.length);
      const saved = await fixture.read(thread.id, who);
      assert.deepEqual(saved.messages.filter(m => m.role === 'signal').map(m => m.id), [first.value.inputMessageId, second.value.inputMessageId, third.value.inputMessageId]);
      assert.deepEqual(saved.messages.filter(m => m.role === 'assistant').map(m => m.id), [interrupted.value.assistantMessageId, completeSecond.value.assistantMessageId, completeThird.value.assistantMessageId]);
      assert.deepEqual(saved.messages.map(m => m.content.parts.filter(p => p.type === 'text').map(p => p.text).join('')), ['Exact facade active input', `Partial ${initial.calls + 1} `, 'Exact facade queued input two', `Partial ${initial.calls + 2} complete.`, 'Exact facade queued input three', `Partial ${initial.calls + 3} complete.`]);
      const beforeReload = await fixture.snapshot(), calls = (await fixture.state()).calls;
      for (let n = 0; n < 2; n++) assert.deepEqual((await fixture.read(thread.id, who)).messages.map(m => m.id), saved.messages.map(m => m.id));
      assert.equal(await fixture.snapshot(), beforeReload); assert.equal((await fixture.state()).calls, calls);
      await fixture.released();
      const expired = await client.native.observeTurn({ runId: first.value.runId }); assert.ok(!expired.ok && expired.error.code === 'not_found', 'Expired replay cannot fabricate retained execution status');
    } finally { for (const observer of opened) observer.close(); await settleNativeControl(fixture); }
  });
});

test('api-client native Stop/subscription stalls and delayed requests are bounded without invented cancellation', { timeout: 120000 }, async t => {
  const fixture = await nativeControlFixture(); t.after(fixture.close);
  const client = createApiClient({ baseUrl: fixture.origin, getAccessToken: () => fixture.accessToken() });
  const active = async (message: string) => {
    const initial = await fixture.state(), thread = await fixture.thread(), scope = { threadId: thread.id, resourceId: fixture.users[0]!.id };
    const sent = await client.native.sendText({ ...scope, message }); assert.ok(sent.ok); await fixture.wait(s => s.active === 1);
    return { scope, sent: sent.value, initial };
  };
  await t.test('default three-second exact subscription header deadline, independent five-second watchdog', async () => {
    const { sent, initial } = await active('Held observation transport');
    try {
      await fixture.barrier('observe'); const start = performance.now(); const result = await withinFiveSeconds(client.native.observeTurn({ runId: sent.runId }));
      assert.ok(!result.ok && result.error.code === 'timed_out'); assert.ok(performance.now() - start >= 2800 && performance.now() - start < 4000);
      assert.equal((await fixture.state()).aborts.length, initial.aborts.length); assert.equal((await fixture.state()).calls, initial.calls + 1);
      await fixture.unblock(); await fixture.release(initial.calls + 1); await fixture.released();
    } finally { await settleNativeControl(fixture); }
  });
  await t.test('delayed Stop reaches native execution only after its queued successor starts', async () => {
    const { scope, sent, initial } = await active('Delayed exact native Stop');
    try {
      const queued = await client.native.queueText({ ...scope, message: 'Successor before delayed Stop dispatch' }); assert.ok(queued.ok);
      await fixture.barrier('stop'); const start = performance.now(), delayed = client.native.stop({ ...scope, runId: sent.runId });
      await fixture.wait(s => s.held === 1);
      const current = await client.native.stop({ ...scope, runId: sent.runId }); assert.ok(current.ok && current.value.abortRequested);
      await fixture.wait(s => s.providerGates.includes(initial.calls + 2)); const beforeRelease = await fixture.state();
      await fixture.unblock(); const old = await withinFiveSeconds(delayed); assert.ok(old.ok && !old.value.abortRequested); assert.ok(performance.now() - start < 3000);
      const afterRelease = await fixture.wait(s => s.aborts.length === initial.aborts.length + 2);
      assert.deepEqual(afterRelease.aborts.at(-1), { expectedRunId: sent.runId, aborted: false });
      assert.equal(afterRelease.cancelled, beforeRelease.cancelled); assert.equal(afterRelease.aborted, beforeRelease.aborted); assert.ok(afterRelease.providerGates.includes(initial.calls + 2));
      await fixture.release(initial.calls + 2); await fixture.released();
    } finally { await settleNativeControl(fixture); }
  });
  await t.test('timed-out Stop is uncertain and cannot stop the next queued turn', async () => {
    const { scope, sent, initial } = await active('Timed-out old Stop');
    try {
      const queued = await client.native.queueText({ ...scope, message: 'Queued successor survives late Stop' }); assert.ok(queued.ok);
      await fixture.barrier('stop'); const start = performance.now(), late = client.native.stop({ ...scope, runId: sent.runId });
      await fixture.wait(s => s.held === 1);
      const currentStop = await client.native.stop({ ...scope, runId: sent.runId }); assert.ok(currentStop.ok && currentStop.value.abortRequested);
      await fixture.wait(s => s.providerGates.includes(initial.calls + 2));
      const result = await withinFiveSeconds(late); assert.ok(!result.ok && result.error.code === 'timed_out'); assert.ok(performance.now() - start >= 2800 && performance.now() - start < 4000);
      const beforeRelease = await fixture.state(); await fixture.unblock();
      await fixture.wait(s => !s.held && !s.heldListeners); await delay(50);
      const afterRelease = await fixture.state();
      // Transport abort may prevent handler dispatch; any delivered late Stop must remain conditional.
      for (const lateAbort of afterRelease.aborts.slice(initial.aborts.length + 1)) assert.deepEqual(lateAbort, { expectedRunId: sent.runId, aborted: false });
      assert.equal(afterRelease.cancelled, beforeRelease.cancelled); assert.equal(afterRelease.aborted, beforeRelease.aborted); assert.ok(afterRelease.providerGates.includes(initial.calls + 2));
      await fixture.release(initial.calls + 2); await fixture.released();
      assert.deepEqual((await fixture.read(scope.threadId)).messages.filter(m => m.role === 'signal').map(m => m.id), [sent.inputMessageId, queued.value.inputMessageId]);
    } finally { await settleNativeControl(fixture); }
  });
  await t.test('late native metadata resolution is detached after caller deadline', async () => {
    const { sent, initial } = await active('Held native identity resolution');
    try {
      await fixture.barrier('metadata'); const result = await withinFiveSeconds(client.native.observeTurn({ runId: sent.runId })); assert.ok(!result.ok && result.error.code === 'timed_out');
      await fixture.unblock(); await fixture.wait(s => !s.held && !s.metadataObservers);
      assert.equal((await fixture.state()).aborts.length, initial.aborts.length); await fixture.release(initial.calls + 1); await fixture.released();
    } finally { await settleNativeControl(fixture); }
  });
  await t.test('caller cancellation is local only; delayed old Stop still cannot stop a newer native run', async () => {
    const { scope, sent, initial } = await active('Caller-cancelled old Stop');
    try {
      const queued = await client.native.queueText({ ...scope, message: 'Successor after local Stop cancellation' }); assert.ok(queued.ok);
      await fixture.barrier('stop'); const controller = new AbortController(), pending = client.native.stop({ ...scope, runId: sent.runId }, { signal: controller.signal });
      await fixture.wait(s => s.held === 1); controller.abort(); const result = await withinFiveSeconds(pending); assert.ok(!result.ok && result.error.code === 'cancelled');
      await fixture.release(initial.calls + 1); await fixture.wait(s => s.providerGates.includes(initial.calls + 2));
      await fixture.unblock(); await fixture.wait(s => s.aborts.length === initial.aborts.length + 1);
      const unaffected = await fixture.state(); assert.equal(unaffected.aborts.at(-1)?.aborted, false); assert.ok(unaffected.providerGates.includes(initial.calls + 2));
      await fixture.release(initial.calls + 2); await fixture.released();
    } finally { await settleNativeControl(fixture); }
  });
  await t.test('invalid and absent controls have no provider/native persistence effects', async () => {
    const before = await fixture.snapshot(), state = await fixture.state(), thread = await fixture.thread(); const scope = { threadId: thread.id, resourceId: fixture.users[0]!.id };
    const stable = await fixture.snapshot();
    const missing = await client.native.stop({ ...scope, runId: randomUUID() }); assert.ok(missing.ok && !missing.value.abortRequested);
    const absent = await client.native.observeTurn({ runId: randomUUID() }); assert.ok(!absent.ok && absent.error.code === 'not_found');
    const bad = await client.native.stop({ ...scope, runId: 'malformed' }); assert.ok(!bad.ok && bad.error.code === 'invalid_input');
    assert.equal((await fixture.request('/api/agents/assistant/threads/abort', { ...scope, clearPendingSignals: true, expectedRunId: randomUUID() })).status, 400);
    assert.equal((await fixture.request('/api/agents/assistant/observe', { runId: randomUUID(), requestContext: { accountId: fixture.users[1]!.id } })).status, 400);
    assert.equal((await fixture.state()).calls, state.calls); assert.equal(await fixture.snapshot(), stable); assert.notEqual(before, stable);
    await delay(20); await fixture.released();
  });
});

test('native execution controls fail closed across live account boundaries and stay disabled in production', { timeout: 60000 }, async t => {
  const fixture = await nativeControlFixture(); t.after(fixture.close);
  const clients = [0, 1].map(who => createApiClient({ baseUrl: fixture.origin, getAccessToken: () => fixture.accessToken(who) }));
  const threads = await Promise.all([fixture.thread(), fixture.thread(1)]), scopes = threads.map((thread, who) => ({ threadId: thread.id, resourceId: fixture.users[who]!.id }));
  const sent = [];
  for (const who of [0, 1]) { const result = await clients[who]!.native.sendText({ ...scopes[who]!, message: `Owned control boundary ${who}` }); assert.ok(result.ok); sent.push(result.value); }
  await fixture.wait(s => s.active === 2);
  try {
    const before = await fixture.snapshot(), state = await fixture.state();
    const wrongExecution = await clients[0]!.native.stop({ ...scopes[0]!, runId: sent[1]!.runId }); assert.ok(wrongExecution.ok && !wrongExecution.value.abortRequested);
    assert.deepEqual(await fixture.sdk().abortThread({ ...scopes[0]!, expectedRunId: sent[1]!.runId, clearPendingSignals: false }), { aborted: false });
    const foreignThread = await clients[0]!.native.stop({ threadId: threads[1]!.id, resourceId: scopes[0]!.resourceId, runId: sent[1]!.runId }); assert.ok(!foreignThread.ok && foreignThread.error.code === 'not_found');
    for (const who of [0, 1]) {
      const foreign = await clients[who]!.native.observeTurn({ runId: sent[1 - who]!.runId }); assert.ok(!foreign.ok && foreign.error.code === 'not_found');
      await assert.rejects(fixture.sdk(who).observe({ runId: sent[1 - who]!.runId }));
    }
    for (const body of [
      { ...scopes[0] },
      { ...scopes[0], expectedRunId: sent[0]!.runId, clearPendingSignals: true },
      { ...scopes[1], expectedRunId: sent[1]!.runId },
      { ...scopes[0], expectedRunId: sent[0]!.runId, requestContext: { accountId: scopes[1]!.resourceId } },
    ]) assert.equal((await fixture.request('/api/agents/assistant/threads/abort', body)).status, 400);
    const cors = await fixture.request('/api/agents/assistant/observe', { runId: sent[0]!.runId, offset: 1 }, 0, true, 'http://127.0.0.1:4180'); assert.equal(cors.status, 400); assert.equal(cors.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:4180');
    assert.equal((await fixture.request('/api/agents/assistant/observe', { runId: sent[0]!.runId }, 0, false)).status, 401);
    assert.equal((await fixture.request('/api/agents/assistant/queue-message', { ...scopes[0], message: 'x'.repeat(8193) })).status, 400);
    const after = await fixture.state(); assert.equal(after.active, 2); assert.equal(after.calls, state.calls); assert.equal(after.cancelled, state.cancelled); assert.equal(after.aborted, state.aborted); assert.equal(await fixture.snapshot(), before);
  } finally { await settleNativeControl(fixture); await fixture.released(); }
  const saved = await fixture.snapshot(), production = await fixture.production();
  for (const [tail, body] of [
    ['queue-message', { ...scopes[0], message: 'Production must not queue' }],
    ['threads/abort', { ...scopes[0], expectedRunId: sent[0]!.runId, clearPendingSignals: false }],
    ['observe', { runId: sent[0]!.runId }],
  ] as const) assert.equal((await production.request('/api/agents/assistant/' + tail, body)).status, 503);
  assert.equal((await production.request('/turn-test/control')).status, 404); assert.equal(await fixture.snapshot(), saved);
});
