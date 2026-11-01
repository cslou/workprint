import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createApiClient, nativeTransportLimits } from '@workprint/api-client';

const scope = { threadId: '11111111-1111-4111-8111-111111111111', resourceId: '22222222-2222-4222-8222-222222222222' };
const executionId = '33333333-3333-4333-8333-333333333333';

// Transport faults only: not native compatibility/persistence proof or a replacement native stream implementation.
test('native facade bounds actual HTTP/token/stream faults and releases resources without retries or Stop', async t => {
  let mode = 'hold', requests = 0, openResponses = 0;
  const paths: string[] = [];
  const server = createServer((request, response) => {
    requests++; paths.push(request.url ?? ''); openResponses++; response.once('close', () => { openResponses--; });
    assert.equal(request.headers.cookie, undefined);
    if (mode === 'hold') return;
    if (mode === 'json-held') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.write('{'); return; }
    if (mode === 'rejected') { response.writeHead(503, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { code: 'integration_failure', message: 'Native turns unavailable' } })); return; }
    if (mode === 'bad-ack') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ accepted: true, runId: executionId, signal: { id: executionId, type: 'user', contents: 'Text' } })); return; }
    if (mode === 'control-stop-good' || mode === 'control-stop-bad') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(mode === 'control-stop-good' ? { aborted: false } : { cancelled: true })); return; }
    response.writeHead(200, { 'Content-Type': mode === 'wrong-type' ? 'text/plain' : 'text/event-stream' }); response.flushHeaders();
    if (mode.startsWith('control-')) {
      const messageId = '44444444-4444-4444-8444-444444444444';
      const start = { type: 'chunk', runId: executionId, data: { type: 'start', runId: mode === 'control-mismatch' ? messageId : executionId, payload: { messageId } } };
      const delta = { type: 'chunk', runId: executionId, data: { type: 'text-delta', runId: executionId, payload: { text: 'Exact control text' } } };
      const finish = { type: 'finish', runId: executionId, data: { stepResult: { reason: mode === 'control-interrupted' ? 'abort' : 'stop', messageId } } };
      const events = mode === 'control-missing-start' ? [finish] : mode === 'control-incomplete' ? [start, delta] : mode === 'control-error' ? [start, { type: 'error', runId: executionId, data: { error: { name: 'PrivateInternalError', message: 'private-error-marker' } } }] : [start, delta, finish];
      response.end(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')); return;
    }
    if (mode === 'stream-held') return;
    if (mode === 'wire-large' || mode === 'wire-at') { response.end('X'.repeat(nativeTransportLimits.wireBytes + (mode === 'wire-large' ? 1 : 0))); return; }
    response.end('malformed or incomplete native stream\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const client = createApiClient({ baseUrl, getAccessToken: async () => 'synthetic-fault-only-bearer', timeoutMs: 120 });
  const released = async () => {
    const deadline = Date.now() + 1500;
    while (openResponses) { assert.ok(Date.now() < deadline, 'HTTP response must release'); await delay(10); }
  };
  for (const phase of ['send', 'subscription', 'queue', 'stop', 'exact-subscription'] as const) for (const fault of ['hold', ...(['send', 'queue', 'stop'].includes(phase) ? ['json-held'] : [])]) await t.test(`${phase} ${fault} returns typed establishment deadline once`, async () => {
    mode = fault; const before = requests, start = performance.now();
    const result = await (phase === 'send' ? client.native.sendText({ ...scope, message: 'Text' }) : phase === 'queue' ? client.native.queueText({ ...scope, message: 'Text' }) : phase === 'stop' ? client.native.stop({ ...scope, runId: executionId }) : phase === 'exact-subscription' ? client.native.observeTurn({ runId: executionId }) : client.native.subscribe(scope));
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'timed_out');
    assert.ok(performance.now() - start < 1500); await released(); assert.equal(requests - before, 1);
  });
  for (const fault of ['stream-held', 'wire-large', 'wire-at', 'wrong-type', 'eof']) await t.test(`${fault} cannot be reported as a successful native completion`, async () => {
    mode = fault; const before = requests;
    const subscription = await client.native.subscribe(scope);
    if (fault === 'wrong-type') { assert.equal(subscription.ok, false); if (!subscription.ok) assert.equal(subscription.error.code, 'invalid_response'); }
    else {
      assert.ok(subscription.ok);
      const result = await subscription.value.consume(executionId, () => {}); subscription.value.close();
      assert.equal(result.ok, false); if (!result.ok) {
        assert.equal(result.error.code, fault === 'stream-held' ? 'timed_out' : 'invalid_response');
        if (fault === 'wire-large') assert.equal(result.error.message, 'Native stream too large');
        if (fault === 'wire-at') assert.equal(result.error.message, 'Native stream ended without a terminal result');
      }
    }
    await released(); assert.equal(requests - before, 1);
  });
  await t.test('default observation deadline is finite and closes a real stalled HTTP stream', async () => {
    mode = 'stream-held'; const before = requests;
    const native = createApiClient({ baseUrl, getAccessToken: async () => 'synthetic-fault-only-bearer' }).native;
    const subscription = await native.subscribe(scope); assert.ok(subscription.ok);
    const started = performance.now(); let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([subscription.value.consume(executionId, () => {}), new Promise<never>((_, reject) => { watchdog = setTimeout(() => reject(new Error('Independent observation watchdog exceeded')), 12000); })]);
      assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'timed_out');
      assert.ok(performance.now() - started >= 8800 && performance.now() - started < 10500);
    } finally { clearTimeout(watchdog); subscription.value.close(); }
    await released(); assert.equal(requests - before, 1);
  });
  await t.test('matched HTTP rejection and aliased execution/message acknowledgment remain typed failures', async () => {
    for (const fault of ['rejected', 'bad-ack']) {
      mode = fault; const before = requests;
      const result = await client.native.sendText({ ...scope, message: 'Text' }); assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, fault === 'rejected' ? 'integration_failure' : 'invalid_response');
      await released(); assert.equal(requests - before, 1);
    }
  });
  await t.test('observation close and external cancellation settle without native Stop', async () => {
    mode = 'stream-held'; const before = paths.length, controller = new AbortController();
    const subscription = await client.native.subscribe(scope, { signal: controller.signal }); assert.ok(subscription.ok);
    const consumption = subscription.value.consume(executionId, () => {}); controller.abort();
    const result = await consumption; assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'cancelled');
    subscription.value.close(); await released();
    const second = await client.native.subscribe(scope); assert.ok(second.ok); second.value.close();
    const closed = await second.value.consume(executionId, () => {}); assert.equal(closed.ok, false); if (!closed.ok) assert.equal(closed.error.code, 'cancelled');
    await released(); assert.ok(paths.slice(before).every(path => !path.includes('/abort') && !path.includes('/stop')));
  });
  for (const fault of ['control-complete', 'control-interrupted', 'control-missing-start', 'control-incomplete', 'control-mismatch', 'control-error']) await t.test(`exact native event decoding: ${fault}`, async () => {
    mode = fault; const before = requests, observation = await client.native.observeTurn({ runId: executionId }); assert.ok(observation.ok);
    let text = ''; const result = await observation.value.consume(part => { text += part.text; }); observation.value.close();
    if (fault === 'control-complete' || fault === 'control-interrupted') { assert.ok(result.ok); assert.equal(result.value.outcome, fault === 'control-complete' ? 'complete' : 'interrupted'); assert.equal(text, 'Exact control text'); }
    else { assert.ok(!result.ok); assert.equal(result.error.code, fault === 'control-error' ? 'integration_failure' : 'invalid_response'); assert.ok(!JSON.stringify(result).includes('private-error-marker')); }
    await released(); assert.equal(requests - before, 1);
  });
  await t.test('native Stop acknowledgment does not fabricate cancellation or accept another response shape', async () => {
    for (const fault of ['control-stop-good', 'control-stop-bad']) {
      mode = fault; const result = await client.native.stop({ ...scope, runId: executionId });
      if (fault === 'control-stop-good') { assert.ok(result.ok); assert.deepEqual(result.value, { runId: executionId, abortRequested: false }); }
      else assert.ok(!result.ok && result.error.code === 'invalid_response');
      await released();
    }
  });
  await t.test('exact observation close and cancellation never send Stop', async () => {
    mode = 'stream-held'; const before = paths.length;
    const opened = await client.native.observeTurn({ runId: executionId }); assert.ok(opened.ok); opened.value.close();
    const result = await opened.value.consume(() => {}); assert.ok(!result.ok && result.error.code === 'cancelled'); await released();
    const controller = new AbortController(), second = await client.native.observeTurn({ runId: executionId }, { signal: controller.signal }); assert.ok(second.ok);
    const pending = second.value.consume(() => {}); controller.abort(); const cancelled = await pending; assert.ok(!cancelled.ok && cancelled.error.code === 'cancelled'); await released();
    assert.deepEqual(paths.slice(before), ['/api/agents/assistant/observe', '/api/agents/assistant/observe']);
  });
  await t.test('control token deadlines/cancellation never dispatch late work', async () => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }), before = requests;
    const suspended = createApiClient({ baseUrl, timeoutMs: 100, getAccessToken: async () => { await gate; return 'synthetic-fault-only-bearer'; } });
    try {
      for (const operation of [() => suspended.native.queueText({ ...scope, message: 'Text' }), () => suspended.native.stop({ ...scope, runId: executionId }), () => suspended.native.observeTurn({ runId: executionId })]) { const result = await operation(); assert.ok(!result.ok && result.error.code === 'timed_out'); }
      const controller = new AbortController(), pending = suspended.native.stop({ ...scope, runId: executionId }, { signal: controller.signal }); controller.abort(); const result = await pending; assert.ok(!result.ok && result.error.code === 'cancelled');
      for (const value of [await suspended.native.queueText(), await suspended.native.observeTurn()]) assert.ok(!value.ok && value.error.code === 'not_implemented');
    } finally { release(); }
    await delay(50); assert.equal(requests, before);
  });
  await t.test('suspended token acquisition and legacy no-input methods never dispatch late work', async () => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); const before = requests;
    const suspended = createApiClient({ baseUrl, timeoutMs: 100, getAccessToken: async () => { await gate; return 'synthetic-fault-only-bearer'; } });
    try {
      const deadline = await suspended.native.sendText({ ...scope, message: 'Text' }); assert.equal(deadline.ok, false); if (!deadline.ok) assert.equal(deadline.error.code, 'timed_out');
      const controller = new AbortController(); const observation = suspended.native.subscribe(scope, { signal: controller.signal }); controller.abort();
      const cancelled = await observation; assert.equal(cancelled.ok, false); if (!cancelled.ok) assert.equal(cancelled.error.code, 'cancelled');
      for (const result of [await suspended.native.sendText(), await suspended.native.subscribe(), await suspended.native.stop()]) { assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'not_implemented'); }
    } finally { release(); }
    await delay(50); assert.equal(requests, before);
  });
});
