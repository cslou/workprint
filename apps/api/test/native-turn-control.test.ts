import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { nativeControlFixture, settleNativeControl, withinFiveSeconds } from './native-control-fixture.js';

type Fixture = Awaited<ReturnType<typeof nativeControlFixture>>;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function receipt(value: unknown) {
  assert.ok(object(value) && value.accepted === true && typeof value.runId === 'string' && object(value.signal) && typeof value.signal.id === 'string');
  assert.notEqual(value.runId, value.signal.id); return { runId: value.runId, inputMessageId: value.signal.id };
}
async function observeRun(agent: ReturnType<Fixture['sdk']>, runId: string) {
  const start = performance.now(), response = await withinFiveSeconds(agent.observe({ runId }));
  assert.ok(performance.now() - start < 3000, 'Native exact observation must establish within three seconds');
  const parts: unknown[] = []; await withinFiveSeconds(response.processDataStream({ onChunk: part => { parts.push(part); } }));
  const native = parts.filter(object), begin = native.find(part => part.type === 'chunk' && object(part.data) && part.data.type === 'start');
  assert.ok(begin?.runId === runId && object(begin.data) && object(begin.data.payload) && typeof begin.data.payload.messageId === 'string');
  const finish = native.find(part => part.type === 'finish' && part.runId === runId); assert.ok(finish && object(finish.data) && object(finish.data.stepResult));
  return { runId, assistantMessageId: begin.data.payload.messageId, reason: finish.data.stepResult.reason, parts };
}
test('official native SDK qualifies queued exact turns and owned replay through built serving', { timeout: 120000 }, async t => {
  const fixture = await nativeControlFixture(); t.after(fixture.close);
  for (const who of [0, 1]) await t.test(`independent account ${who}: queue, observer detach, exact Stop and native interruption`, async () => {
    const sdk = fixture.sdk(who), thread = await fixture.thread(who), scope = { threadId: thread.id, resourceId: fixture.users[who]!.id };
    const initial = await fixture.state(), chunks: unknown[] = [];
    const subStart = performance.now(), sub = await withinFiveSeconds(sdk.subscribeToThread({ ...scope, withInitialHistory: false }));
    assert.ok(performance.now() - subStart < 3000);
    const pump = sub.processDataStream({ reconnect: false, onChunk: part => { chunks.push(part); } }).catch(error => { if (!(error instanceof Error && error.name === 'AbortError')) throw error; });
    try {
      const first = receipt(await withinFiveSeconds(sdk.sendMessage({ ...scope, message: 'Exact native active input', ifIdle: { behavior: 'wake' } })));
      await fixture.wait(s => s.active === 1 && s.calls === initial.calls + 1);
      const second = receipt(await withinFiveSeconds(sdk.queueMessage({ ...scope, message: 'Exact native queued input two' })));
      const third = receipt(await withinFiveSeconds(sdk.queueMessage({ ...scope, message: 'Exact native queued input three' })));
      assert.equal((await fixture.state()).calls, initial.calls + 1, 'Queue acceptance must not execute a second provider concurrently');
      sub.unsubscribe(); await pump;
      const detached = await fixture.wait(s => !s.observers && !s.pumps);
      assert.equal(detached.active, 1); assert.equal(detached.aborts.length, initial.aborts.length, 'Disconnect sends no Stop');
      const beforeStop = performance.now(); assert.deepEqual(await withinFiveSeconds(sdk.abortThread({ ...scope, expectedRunId: first.runId, clearPendingSignals: false })), { aborted: true });
      assert.ok(performance.now() - beforeStop < 3000);
      await fixture.wait(s => s.providerGates.includes(initial.calls + 2));
      const replay = await observeRun(sdk, first.runId); assert.equal(replay.reason, 'abort', 'Actual native status, not EOF/ack, identifies interruption');
      const current = await fixture.state();
      for (let repeated = 0; repeated < 2; repeated++) {
        const start = performance.now(); assert.deepEqual(await withinFiveSeconds(sdk.abortThread({ ...scope, expectedRunId: first.runId, clearPendingSignals: false })), { aborted: false }); assert.ok(performance.now() - start < 3000);
      }
      assert.deepEqual(await withinFiveSeconds(sdk.abortThread({ ...scope, expectedRunId: randomUUID(), clearPendingSignals: false })), { aborted: false });
      const unaffected = await fixture.state(); assert.equal(unaffected.cancelled, current.cancelled); assert.equal(unaffected.aborted, current.aborted); assert.ok(unaffected.providerGates.includes(initial.calls + 2));
      const beforeForeign = await fixture.snapshot(); await assert.rejects(fixture.sdk(1 - who).observe({ runId: first.runId })); assert.equal(await fixture.snapshot(), beforeForeign);
      const following = await withinFiveSeconds(sdk.subscribeToThread({ ...scope, withInitialHistory: false })); const more: unknown[] = [];
      const followingPump = following.processDataStream({ reconnect: false, onChunk: part => { more.push(part); } }).catch(error => { if (!(error instanceof Error && error.name === 'AbortError')) throw error; });
      try {
        await fixture.release(initial.calls + 2); await fixture.wait(s => s.providerGates.includes(initial.calls + 3));
        await fixture.release(initial.calls + 3); await fixture.wait(s => !s.active && !s.activeRuns.length);
        const complete = await observeRun(sdk, third.runId); assert.equal(complete.reason, 'stop');
        const saved = await fixture.read(thread.id, who);
        assert.deepEqual(saved.messages.filter(m => m.role === 'signal').map(m => m.id), [first.inputMessageId, second.inputMessageId, third.inputMessageId]);
        assert.equal(saved.messages.filter(m => m.id === replay.assistantMessageId).length, 1);
        assert.equal(saved.messages.filter(m => m.id === complete.assistantMessageId).length, 1);
        assert.deepEqual(saved.messages.map(m => m.content.parts.filter(p => p.type === 'text').map(p => p.text).join('')), ['Exact native active input', `Partial ${initial.calls + 1} `, 'Exact native queued input two', `Partial ${initial.calls + 2} complete.`, 'Exact native queued input three', `Partial ${initial.calls + 3} complete.`]);
        const starts = more.filter(object).filter(p => p.type === 'start').map(p => p.runId); assert.deepEqual(starts, [second.runId, third.runId]);
        const settled = await fixture.snapshot(), calls = (await fixture.state()).calls;
        for (let n = 0; n < 2; n++) assert.deepEqual((await fixture.read(thread.id, who)).messages.map(m => m.id), saved.messages.map(m => m.id));
        assert.equal(await fixture.snapshot(), settled); assert.equal((await fixture.state()).calls, calls);
      } finally { following.unsubscribe(); await followingPump; }
      await fixture.released();
    } finally { sub.unsubscribe(); await pump; await settleNativeControl(fixture); }
  });
});

test('official native SDK public AbortSignal bounds exact observation and Stop acknowledgment', { timeout: 60000 }, async t => {
  const fixture = await nativeControlFixture(); t.after(fixture.close);
  for (const kind of ['observe', 'stop'] as const) await t.test(`configured three-second ${kind} stall rejects under independent five-second watchdog`, async () => {
    const thread = await fixture.thread(), scope = { threadId: thread.id, resourceId: fixture.users[0]!.id };
    const sent = receipt(await fixture.sdk().sendMessage({ ...scope, message: `Native SDK ${kind} stall`, ifIdle: { behavior: 'wake' } }));
    await fixture.wait(s => s.active === 1); await fixture.barrier(kind);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3000), start = performance.now();
    try {
      const sdk = fixture.sdk(0, controller.signal);
      await assert.rejects(withinFiveSeconds<unknown>(kind === 'observe' ? sdk.observe({ runId: sent.runId }) : sdk.abortThread({ ...scope, expectedRunId: sent.runId, clearPendingSignals: false })), error => error instanceof Error && Boolean(error.name) && controller.signal.aborted);
      assert.ok(performance.now() - start >= 2800 && performance.now() - start < 4000);
    } finally { clearTimeout(timer); await settleNativeControl(fixture); await fixture.released(); }
  });
});
