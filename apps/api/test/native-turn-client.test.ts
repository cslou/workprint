import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApiClient, type ApiClient, type NativeTurnScope } from '@workprint/api-client';
import { nativeTurnFixture, releasedNativeFixture } from './native-turn-fixture.js';

test('api-client independently qualifies native send/observe/persist through real serving and two accounts', { timeout: 120000 }, async t => {
  const fixture = await nativeTurnFixture(); t.after(fixture.close);
  const clients = [0, 1].map(who => createApiClient({ baseUrl: fixture.origin, getAccessToken: () => fixture.accessToken(who) }));
  const persisted: { who: number; threadId: string; ids: string[]; text: string[] }[] = [];
  const turn = async (client: ApiClient, scope: NativeTurnScope, message = 'Exact native signal text') => {
    const opened = await client.native.subscribe(scope); assert.ok(opened.ok);
    let text = '';
    try {
      const sent = await client.native.sendText({ ...scope, message }); assert.ok(sent.ok);
      const observed = await opened.value.consume(sent.value.runId, part => { assert.equal(part.runId, sent.value.runId); text += part.text; });
      await releasedNativeFixture(fixture);
      return { sent: sent.value, observed, text };
    } finally { opened.value.close(); }
  };
  for (const who of [0, 1]) await t.test(`account ${who + 1} native IDs/text/order reload without stream reconstruction or replay`, async () => {
    await fixture.mode('formatted'); const thread = await fixture.thread(who); const scope = { resourceId: fixture.users[who]!.id, threadId: thread.id };
    const message = ' \nExact user\t🍿 \n'; const result = await turn(clients[who]!, scope, message); assert.ok(result.observed.ok);
    assert.equal(result.text, ' \nControlled  café\tanswer. 🍿\n ');
    const saved = await fixture.read(thread.id, who); assert.equal(saved.messages.length, 2);
    assert.equal(saved.messages[0]!.id, result.sent.inputMessageId); assert.equal(saved.messages[1]!.id, result.observed.value.assistantMessageId);
    assert.notEqual(result.sent.runId, result.sent.inputMessageId); assert.equal(result.observed.value.runId, result.sent.runId);
    persisted.push({ who, threadId: thread.id, ids: [...saved.messages].reverse().map(m => m.id), text: [result.text, message] });
    const before = await fixture.snapshot(), calls = (await fixture.state()).calls;
    for (let i = 0; i < 2; i++) {
      const reload = await clients[who]!.native.loadMessages({ id: thread.id, resourceId: scope.resourceId, page: 0, perPage: 20 }); assert.ok(reload.ok);
      assert.deepEqual(reload.value.messages.map(m => m.id), [...saved.messages].reverse().map(m => m.id));
      assert.deepEqual(reload.value.messages.map(m => m.content.parts.filter(p => p.type === 'text').map(p => p.text).join('')), [result.text, message]);
    }
    assert.equal((await fixture.state()).calls, calls); assert.equal(await fixture.snapshot(), before);
  });
  await t.test('api-client invalid/foreign/unavailable scopes never call provider or mutate', async () => {
    const thread = await fixture.thread(); const before = await fixture.snapshot(), calls = (await fixture.state()).calls;
    for (const client of clients) {
      const who = client === clients[0] ? 0 : 1;
      for (const threadId of [randomUUID(), ...(who ? [thread.id] : [])]) {
        const scope = { threadId, resourceId: fixture.users[who]!.id };
        for (const result of [await client.native.sendText({ ...scope, message: 'Not dispatched' }), await client.native.subscribe(scope)]) { assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'not_found'); }
      }
    }
    const scope = { threadId: thread.id, resourceId: fixture.users[0]!.id };
    for (const extra of [{ runId: randomUUID() }, { requestContext: {} }, { model: 'unqualified/model' }]) {
      const result = await clients[0]!.native.sendText({ ...scope, message: 'Invalid override', ...extra }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'invalid_input');
    }
    const oversized = await clients[0]!.native.sendText({ ...scope, message: '🍿'.repeat(2049) }); assert.equal(oversized.ok, false);
    const noIdentity = createApiClient({ baseUrl: fixture.origin, getAccessToken: async () => null });
    const unauthenticated = await noIdentity.native.sendText({ ...scope, message: 'No identity' }); assert.equal(unauthenticated.ok, false); if (!unauthenticated.ok) assert.equal(unauthenticated.error.code, 'unauthenticated');
    assert.equal((await fixture.state()).calls, calls); assert.equal(await fixture.snapshot(), before);
  });
  await t.test('api-client accepts the exact UTF-8 input cap and persists it losslessly', async () => {
    await fixture.mode('complete'); const thread = await fixture.thread(); const message = 'é'.repeat(4096);
    const result = await turn(clients[0]!, { threadId: thread.id, resourceId: fixture.users[0]!.id }, message); assert.ok(result.observed.ok);
    const saved = await fixture.read(thread.id); assert.equal(saved.messages[0]!.id, result.sent.inputMessageId);
    assert.equal(saved.messages[0]!.content.parts.filter(p => p.type === 'text').map(p => p.text).join(''), message);
  });
  for (const phase of ['send-held', 'subscribe-held'] as const) await t.test(`actual built-server ${phase} hits the default establishment deadline without native mutation`, async () => {
    const thread = await fixture.thread(), scope = { threadId: thread.id, resourceId: fixture.users[0]!.id };
    await fixture.mode(phase); const before = await fixture.snapshot(), calls = (await fixture.state()).calls;
    const started = performance.now(); let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([phase === 'send-held' ? clients[0]!.native.sendText({ ...scope, message: 'Never dispatched' }) : clients[0]!.native.subscribe(scope), new Promise<never>((_, reject) => { watchdog = setTimeout(() => reject(new Error('Independent five-second transport watchdog exceeded')), 5000); })]);
      assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'timed_out');
      assert.ok(performance.now() - started >= 2800 && performance.now() - started < 4500);
      const state = await releasedNativeFixture(fixture); assert.equal(state.calls, calls); assert.equal(state.held, 0); assert.equal(state.heldListeners, 0);
      assert.equal(await fixture.snapshot(), before);
    } finally { clearTimeout(watchdog); }
  });
  for (const mode of ['incomplete', 'failure', 'at', 'over', 'before', 'mid', 'slow'] as const) await t.test(`api-client ${mode}: actual native failure/bounds/persistence, not inferred completion`, async () => {
    await fixture.mode(mode); const thread = await fixture.thread(); const calls = (await fixture.state()).calls;
    const result = await turn(clients[0]!, { resourceId: fixture.users[0]!.id, threadId: thread.id });
    const saved = await fixture.read(thread.id); assert.equal(saved.messages[0]!.id, result.sent.inputMessageId);
    assert.equal((await fixture.state()).calls - calls, 1);
    if (mode === 'at' || mode === 'slow') {
      assert.ok(result.observed.ok); assert.equal(saved.messages[1]!.id, result.observed.value.assistantMessageId);
      assert.equal(result.text, mode === 'at' ? 'a'.repeat(64) : 'Controlled native answer.');
    } else {
      assert.equal(result.observed.ok, false); if (!result.observed.ok) assert.equal(result.observed.error.code, mode === 'before' || mode === 'mid' ? 'timed_out' : 'integration_failure');
      assert.ok(!JSON.stringify(result.observed).includes('file:') && !JSON.stringify(result.observed).includes('Controlled provider failure'), 'Never publish raw native error/stack');
      if (mode === 'over' || mode === 'incomplete') assert.equal(saved.messages.length, 1);
      else assert.ok(saved.messages[1]!.content.parts.some(p => p.type === 'error'));
    }
  });
  await t.test('closing observation sends no Stop and never implies server cancellation', async () => {
    await fixture.mode('slow'); const thread = await fixture.thread(), scope = { resourceId: fixture.users[0]!.id, threadId: thread.id };
    const client = createApiClient({ baseUrl: fixture.origin, getAccessToken: () => fixture.accessToken(), timeoutMs: 150 });
    const subscription = await client.native.subscribe(scope); assert.ok(subscription.ok);
    const sent = await clients[0]!.native.sendText({ ...scope, message: 'Exact native signal text' }); assert.ok(sent.ok);
    const result = await subscription.value.consume(sent.value.runId, () => {}); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'timed_out');
    subscription.value.close(); await releasedNativeFixture(fixture);
    const saved = await fixture.read(thread.id); assert.equal(saved.messages.length, 2); assert.equal(saved.messages[0]!.id, sent.value.inputMessageId);
    assert.equal(saved.messages[1]!.content.parts.filter(p => p.type === 'text').map(p => p.text).join(''), 'Controlled native answer.');
  });
  await t.test('production capability unavailable through api-client; no test flags enable it', async () => {
    const thread = await fixture.thread(), before = await fixture.snapshot(); const production = await fixture.production();
    const client = createApiClient({ baseUrl: production.origin, getAccessToken: () => fixture.accessToken() });
    for (const result of [await client.native.sendText({ threadId: thread.id, resourceId: fixture.users[0]!.id, message: 'Disabled' }), await client.native.subscribe({ threadId: thread.id, resourceId: fixture.users[0]!.id })]) { assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'integration_failure'); }
    for (const saved of persisted) {
      const reloadedClient = createApiClient({ baseUrl: production.origin, getAccessToken: () => fixture.accessToken(saved.who) });
      const reloaded = await reloadedClient.native.loadMessages({ id: saved.threadId, resourceId: fixture.users[saved.who]!.id, page: 0, perPage: 20 }); assert.ok(reloaded.ok);
      assert.deepEqual(reloaded.value.messages.map(m => m.id), saved.ids);
      assert.deepEqual(reloaded.value.messages.map(m => m.content.parts.filter(p => p.type === 'text').map(p => p.text).join('')), saved.text);
    }
    assert.equal(await fixture.snapshot(), before);
  });
});
