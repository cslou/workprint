import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { nativeTurnLimits } from '../src/agent/mastra/native-turns.js';
import { nativeTurnFixture } from './native-turn-fixture.js';

type Fixture = Awaited<ReturnType<typeof nativeTurnFixture>>;
type Subscription = Awaited<ReturnType<ReturnType<Fixture['sdk']>['subscribeToThread']>>;
type Chunk = Parameters<NonNullable<Parameters<Subscription['processDataStream']>[0]['onChunk']>>[0];

async function released(fixture: Fixture) {
  // A native processing tripwire is not provider cancellation; bound release by the declared execution budget.
  const deadline = Date.now() + nativeTurnLimits.executionMs + 500;
  for (;;) {
    const state = await fixture.state();
    if (!state.active && !state.listeners && !state.timers && !state.observers && !state.pumps && !state.activeRunId && await fixture.nativeRuns() === 0 && await fixture.servingBusy() === 0) return state;
    assert.ok(Date.now() < deadline, 'Native provider/observer resources must release'); await delay(25);
  }
}
async function observeSend(fixture: Fixture, threadId: string, who = 0, message = 'Exact native signal text') {
  const agent = fixture.sdk(who), chunks: Chunk[] = [];
  const subscription = await agent.subscribeToThread({ threadId, resourceId: fixture.users[who]!.id, withInitialHistory: false });
  let finish!: () => void;
  const finished = new Promise<void>(resolve => { finish = resolve; });
  let error: unknown;
  const consumption = subscription.processDataStream({ reconnect: false, onChunk: chunk => {
    chunks.push(chunk); if (['finish', 'tripwire', 'error', 'abort'].includes(chunk.type)) finish();
  } }).catch(cause => { error = cause; finish(); });
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    const accepted = await agent.sendMessage({ threadId, resourceId: fixture.users[who]!.id, message, ifIdle: { behavior: 'wake' } });
    const signal = accepted.signal;
    assert.ok(signal && typeof signal === 'object' && 'id' in signal && typeof signal.id === 'string');
    const acknowledged = performance.now();
    await Promise.race([finished, new Promise<never>((_, reject) => { watchdog = setTimeout(() => reject(new Error('Native turn independent watchdog exceeded')), 11000); })]);
    assert.equal(error, undefined);
    return { chunks, accepted: { ...accepted, signal }, acknowledged, afterAcknowledgmentMs: performance.now() - acknowledged };
  } finally { clearTimeout(watchdog); subscription.unsubscribe(); await consumption; }
}

test('native turns use verified owned input and truthful native persistence', { timeout: 120000 }, async t => {
  const fixture = await nativeTurnFixture(); t.after(fixture.close);
  const own = await fixture.thread(), foreign = await fixture.thread(1);
  await t.test('forged owner cannot dispatch against another verified account', async () => {
    const before = await fixture.snapshot(), calls = (await fixture.state()).calls;
    const response = await fixture.request('/api/agents/assistant/send-message', { threadId: foreign.id, resourceId: fixture.users[1]!.id, message: 'Must never reach provider', ifIdle: { behavior: 'wake' } });
    assert.equal(response.status, 400);
    assert.equal((await fixture.state()).calls, calls); assert.equal(await fixture.snapshot(), before);
  });
  await t.test('public incomplete guard prevents incomplete assistant completion', async () => {
    await released(fixture); await fixture.mode('incomplete'); const thread = await fixture.thread();
    const { chunks, accepted } = await observeSend(fixture, thread.id); await released(fixture);
    assert.equal(accepted.accepted, true);
    const saved = await fixture.read(thread.id);
    assert.equal(saved.messages.length, 1, 'Incomplete provider EOF must not persist an assistant completion');
    assert.ok(chunks.some(chunk => chunk.type === 'tripwire'));
    assert.equal(saved.messages[0]!.id, accepted.signal.id);
  });
  await t.test('supported read-only reload projects only a native user signal without changing its ID', async () => {
    await released(fixture); await fixture.mode('complete'); const { accepted, chunks } = await observeSend(fixture, own.id); await released(fixture);
    const saved = await fixture.read(own.id); assert.equal(saved.messages.length, 2);
    assert.equal(saved.messages[0]!.role, 'signal'); assert.equal(saved.messages[0]!.id, accepted.signal.id);
    const start = chunks.find(chunk => chunk.type === 'start'); assert.ok(start?.type === 'start');
    assert.equal(start.runId, accepted.runId); assert.notEqual(accepted.runId, accepted.signal.id);
    assert.equal(start.payload.messageId, saved.messages[1]!.id);
    const response = await fixture.request(`/memory/threads/${own.id}/messages?page=0&perPage=20`);
    assert.equal(response.status, 200);
    const value = await response.json() as { messages: { id: string; role: string; content: { parts: { text: string }[] } }[] };
    assert.deepEqual(value.messages.map(m => m.id), [...saved.messages].reverse().map(m => m.id));
    assert.deepEqual(value.messages.map(m => m.role), ['assistant', 'user']);
    assert.deepEqual(value.messages.map(m => m.content.parts.map(p => p.text).join('')), ['Controlled native answer.', 'Exact native signal text']);
  });
  await t.test('native SDK independently sends and reloads the second account with exact IDs', async () => {
    await fixture.mode('complete'); const thread = await fixture.thread(1);
    const { chunks, accepted } = await observeSend(fixture, thread.id, 1); await released(fixture);
    const saved = await fixture.read(thread.id, 1);
    assert.equal(saved.messages[0]!.id, accepted.signal.id); assert.equal(saved.messages[0]!.resourceId, fixture.users[1]!.id);
    const start = chunks.find(c => c.type === 'start'); assert.ok(start?.type === 'start'); assert.equal(start.payload.messageId, saved.messages[1]!.id);
    const before = await fixture.snapshot(), calls = (await fixture.state()).calls;
    for (let i = 0; i < 2; i++) {
      const reload = await fixture.navigationSdk(1).listThreadMessages(thread.id, { resourceId: fixture.users[1]!.id, page: 0, perPage: 20 });
      const reloaded = reload.messages.map(m => { assert.ok(m && typeof m === 'object' && 'id' in m && typeof m.id === 'string'); return m.id; });
      assert.deepEqual(reloaded, [...saved.messages].reverse().map(m => m.id));
    }
    assert.equal((await fixture.state()).calls, calls); assert.equal(await fixture.snapshot(), before);
  });
  await t.test('strict native admission rejects foreign/absent/forged/oversized inputs before provider work', async () => {
    const before = await fixture.snapshot(), calls = (await fixture.state()).calls;
    for (const who of [0, 1]) for (const tail of ['send-message', 'threads/subscribe']) {
      const common = { resourceId: fixture.users[who]!.id, ...(tail === 'send-message' ? { message: 'Rejected input' } : { withInitialHistory: false }) };
      for (const threadId of [who ? own.id : foreign.id, randomUUID(), 'malformed']) {
        assert.equal((await fixture.request('/api/agents/assistant/' + tail, { ...common, threadId }, who)).status, 404);
      }
      assert.equal((await fixture.request('/api/agents/assistant/' + tail, { ...common, threadId: who ? foreign.id : own.id }, who, false)).status, 401);
    }
    const input = { resourceId: fixture.users[0]!.id, threadId: own.id, message: 'Rejected override' };
    for (const override of [{ requestContext: { accountId: fixture.users[1]!.id } }, { model: 'unqualified/model' }, { tools: {} }, { runId: randomUUID() }, { streamOptions: {} }, { metadata: {} }, { ifIdle: { behavior: 'force' } }, { message: ['not text'] }, { message: '🍿'.repeat(nativeTurnLimits.inputBytes / 4 + 1) }]) {
      assert.equal((await fixture.request('/api/agents/assistant/send-message', { ...input, ...override })).status, 400);
    }
    assert.equal((await fixture.request('/api/agents/assistant/send-message?resourceId=forged', input)).status, 400);
    assert.equal((await fixture.request('/api/agents/assistant/threads/subscribe', { resourceId: fixture.users[0]!.id, threadId: own.id, withInitialHistory: true })).status, 400, 'History uses the separate bounded privacy-filtered read interface');
    assert.equal((await fixture.state()).calls, calls); assert.equal(await fixture.snapshot(), before);
  });
  await t.test('native preflight and rejected native requests preserve exact shared CORS policy', async () => {
    const calls = (await fixture.state()).calls; const path = '/api/agents/assistant/send-message';
    const origin = 'http://127.0.0.1:4180';
    const preflight = await fetch(fixture.origin + path, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
    const input = { resourceId: fixture.users[0]!.id, threadId: own.id, message: 'Rejected input', ifIdle: { behavior: 'force' } };
    const invalid = await fixture.request(path, input, 0, true, origin);
    assert.equal(invalid.status, 400); assert.equal(invalid.headers.get('Access-Control-Allow-Origin'), origin); assert.equal(invalid.headers.get('Cache-Control'), 'no-store');
    for (const browserOrigin of [origin, 'http://127.0.0.1:9999']) {
      const denied = await fixture.request(path, input, 0, false, browserOrigin);
      assert.equal(denied.status, 401); assert.equal(denied.headers.get('Access-Control-Allow-Origin'), browserOrigin === origin ? origin : null);
    }
    assert.equal((await fixture.state()).calls, calls);
  });
  await t.test('UTF-8 input exactly at the byte cap is saved without normalization', async () => {
    await fixture.mode('complete'); const thread = await fixture.thread(); const text = 'é'.repeat(nativeTurnLimits.inputBytes / 2);
    const { accepted } = await observeSend(fixture, thread.id, 0, text); await released(fixture);
    const saved = await fixture.read(thread.id); assert.equal(saved.messages[0]!.id, accepted.signal.id);
    assert.equal(saved.messages[0]!.content.parts.filter(p => p.type === 'text').map(p => p.text).join(''), text);
  });
  await t.test('native stored text preserves Unicode, whitespace and stream chunk boundaries exactly', async () => {
    await fixture.mode('formatted'); const thread = await fixture.thread(); const input = ' \nExact user\t🍿 \n';
    const { accepted, chunks } = await observeSend(fixture, thread.id, 0, input); await released(fixture);
    const saved = await fixture.read(thread.id); assert.equal(saved.messages[0]!.id, accepted.signal.id);
    const text = saved.messages.map(m => m.content.parts.filter(p => p.type === 'text').map(p => p.text).join(''));
    assert.deepEqual(text, [input, ' \nControlled  café\tanswer. 🍿\n ']);
    assert.equal(chunks.filter(c => c.type === 'text-delta').map(c => c.payload.text).join(''), text[1]);
  });
  for (const mode of ['incomplete-slow', 'failure', 'at', 'over', 'before', 'mid', 'slow'] as const) await t.test(`native ${mode} has truthful persistence, typed boundaries and released handles`, async () => {
    await fixture.mode(mode); const thread = await fixture.thread(); const before = await fixture.state();
    const { accepted, chunks, acknowledged, afterAcknowledgmentMs } = await observeSend(fixture, thread.id); const state = await released(fixture);
    assert.ok(performance.now() - acknowledged < nativeTurnLimits.executionMs + 1500, 'Provider release must fit the declared native execution budget');
    const saved = await fixture.read(thread.id); assert.equal(saved.messages[0]!.id, accepted.signal.id);
    const terminal = chunks.at(-1); assert.ok(terminal);
    const assistant = saved.messages.filter(m => m.role === 'assistant');
    if (mode === 'over') t.diagnostic(`Native cap persistence: ${JSON.stringify(assistant.map(m => ({ parts: m.content.parts.map(p => p.type), metadata: m.content.metadata ?? {} })))}`);
    if (mode === 'incomplete-slow' || mode === 'over') {
      assert.equal(terminal.type, 'tripwire'); assert.equal(assistant.length, 0);
      if (mode === 'over') {
        assert.equal(state.cancelled + state.aborted - before.cancelled - before.aborted, 1, 'Native control must actually release the open provider');
        assert.equal(chunks.filter(c => c.type === 'text-delta').map(c => c.payload.text).join(''), 'a'.repeat(64));
      }
    } else if (mode === 'at' || mode === 'slow') {
      assert.equal(terminal.type, 'finish'); assert.equal(assistant.length, 1);
      assert.equal(assistant[0]!.content.parts.filter(p => p.type === 'text').map(p => p.text).join(''), mode === 'at' ? 'a'.repeat(64) : 'Controlled native answer.');
      if (mode === 'slow') assert.ok(afterAcknowledgmentMs > 2000, 'Intake deadline must end before native execution');
    } else {
      assert.ok(terminal.type === 'error'); assert.equal(assistant.length, 1);
      assert.ok(assistant[0]!.content.parts.some(p => p.type === 'error'), 'Error-bearing partial output is not completion');
      if (mode !== 'failure') {
        const error: unknown = terminal.payload.error;
        assert.ok(error && typeof error === 'object' && 'name' in error && error.name === 'MastraTimeoutError');
        assert.ok('timeoutMs' in error && error.timeoutMs === (mode === 'before' ? nativeTurnLimits.firstContentMs : nativeTurnLimits.modelCallMs));
        assert.ok(afterAcknowledgmentMs < (mode === 'before' ? nativeTurnLimits.firstContentMs : nativeTurnLimits.modelCallMs) + 1500);
      }
      assert.equal((await fixture.request(`/memory/threads/${thread.id}/messages?page=0&perPage=20`)).status, 503, 'Never discard a native error part to project successful text');
    }
    assert.equal(state.calls - before.calls, 1);
  });
  await t.test('public native save hook excludes system records and refuses auxiliary-memory configuration', async () => {
    const thread = await fixture.thread();
    const message = { id: randomUUID(), threadId: thread.id, resourceId: fixture.users[0]!.id, role: 'system' as const, createdAt: new Date(), content: { format: 2 as const, parts: [{ type: 'text' as const, text: 'Private instruction' }] } };
    const before = await fixture.snapshot();
    for (const memoryConfig of [{ workingMemory: { enabled: true } }, { semanticRecall: true }, { observationalMemory: true }]) {
      await assert.rejects(fixture.memorySave({ messages: [message], memoryConfig }), /Auxiliary native memory is unavailable/);
    }
    assert.deepEqual((await fixture.memorySave({ messages: [message] })).messages, []);
    assert.equal(await fixture.snapshot(), before);
  });
  for (const kind of ['notification', 'forged-user'] as const) await t.test(`read projection rejects ${kind} signals`, async () => {
    const thread = await fixture.seedUnsupportedSignal(kind); const before = await fixture.snapshot();
    assert.equal((await fixture.request(`/memory/threads/${thread.id}/messages?page=0&perPage=20`)).status, 503);
    assert.equal(await fixture.snapshot(), before);
  });
  await t.test('production has no provider or controls even with test-looking environment flags', async () => {
    const before = await fixture.snapshot(); const production = await fixture.production();
    for (const who of [0, 1]) {
      const thread = who ? foreign : own;
      for (const tail of ['send-message', 'threads/subscribe']) {
        const response = await production.request('/api/agents/assistant/' + tail, { threadId: thread.id, resourceId: fixture.users[who]!.id, ...(tail === 'send-message' ? { message: 'Unavailable input' } : { withInitialHistory: false }) }, who);
        assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: { code: 'integration_failure', message: 'Native turns unavailable' } });
      }
      for (const path of ['/turn-test/control', '/api/agents', '/api/agents/assistant/threads/abort', '/api/agents/assistant/stream']) assert.equal((await production.request(path, path.includes('/api/agents/assistant/') ? {} : undefined, who)).status, 404);
    }
    assert.equal(await fixture.snapshot(), before);
  });
});
