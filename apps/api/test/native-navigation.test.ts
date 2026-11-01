import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { accountBrowserFixture } from './account-browser-fixture.js';

// Real production entry, isolated Auth and native Postgres; no provider or seed route.
test('owned native create/list/history is bounded, account-exact and read-only on resume', { timeout: 120000 }, async t => {
  const fixture = await accountBrowserFixture(); t.after(fixture.close);
  const users = await Promise.all([fixture.auth.createAccount(), fixture.auth.createAccount()]);
  const tokens = await Promise.all(users.map(async user => {
    const response = await fixture.auth.request('token?grant_type=password', { email: user.email, password: user.password });
    assert.equal(response.status, 200); return (await response.json() as { access_token: string }).access_token;
  }));
  const request = async (path: string, method = 'GET', body?: unknown, who = 0) => {
    const target = path.startsWith('/memory/') || path.startsWith('/api/') ? path : '/memory/threads' + path;
    const response = await fetch(fixture.apiOrigin + target, { method, headers: { Authorization: `Bearer ${tokens[who]}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
    return { status: response.status, value: await response.json() as Record<string, unknown> };
  };
  const ids: string[] = [];
  await t.test('explicit native creates return unique durable identities', async () => {
    for (let i = 0; i < 8; i++) {
      const result = await request('', 'POST', { resourceId: users[0]!.id }); assert.equal(result.status, 200);
      assert.equal(result.value.resourceId, users[0]!.id); assert.equal(typeof result.value.id, 'string'); ids.push(result.value.id as string);
      if (i === 0) t.diagnostic(`Native create observation: ${JSON.stringify({ status: result.status, id: '<thread>', resourceId: '<verified-account>', title: result.value.title, metadata: result.value.metadata, createdAt: result.value.createdAt, updatedAt: result.value.updatedAt })}`);
    }
    assert.equal(new Set(ids).size, 8);
  });
  await t.test('bounded native pages traverse all owned records without creating', async () => {
    const before = await fixture.snapshot(); const seen: string[] = [];
    for (const page of [0, 1, 2]) {
      const response = await request(`?page=${page}&perPage=3`); assert.equal(response.status, 200);
      const value = response.value as { threads: { id: string; resourceId: string }[]; page: number; perPage: number; total: number; hasMore: boolean };
      assert.equal(value.page, page); assert.equal(value.total, 8); assert.equal(value.perPage, 3); assert.equal(value.hasMore, page < 2);
      assert.ok(value.threads.every(thread => thread.resourceId === users[0]!.id)); seen.push(...value.threads.map(thread => thread.id));
    }
    assert.deepEqual([...seen].sort(), [...ids].sort()); assert.equal(await fixture.snapshot(), before);
    const empty = await request('?page=0&perPage=3', 'GET', undefined, 1); assert.deepEqual(empty.value.threads, []);
  });
  const history = await fixture.saveNative(users[0]!.id, Array.from({ length: 9 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, text: `Exact saved message ${index} <b>text only</b>` })), 'Exact saved history');
  await t.test('history preserves native identities, roles, text and order over older pages', async () => {
    const before = await fixture.snapshot(); const loaded: { id: string; content: { parts: { text: string }[] }; threadId: string }[] = [];
    assert.equal((await request('/' + history.id)).status, 200);
    for (const page of [0, 1, 2]) {
      const response = await request(`/${history.id}/messages?page=${page}&perPage=3`); assert.equal(response.status, 200);
      loaded.push(...response.value.messages as typeof loaded);
      if (page === 0) t.diagnostic(`Native history observation: ${JSON.stringify({ keys: Object.keys(response.value).sort(), page: response.value.page, perPage: response.value.perPage, hasMore: response.value.hasMore, messages: (response.value.messages as { role: string; content: unknown }[]).map(message => ({ id: '<message>', threadId: '<thread>', resourceId: '<verified-account>', role: message.role, content: message.content })) })}`);
    }
    assert.equal(new Set(loaded.map(message => message.id)).size, 9);
    assert.ok(loaded.every(message => message.threadId === history.id));
    assert.deepEqual(loaded.map(message => message.content.parts[0]!.text), Array.from({ length: 9 }, (_, index) => `Exact saved message ${8-index} <b>text only</b>`));
    assert.equal(await fixture.snapshot(), before);
  });
  await t.test('foreign, absent and malformed references are indistinguishable and effect-free', async () => {
    const before = await fixture.snapshot();
    for (const tail of ['', '/messages?page=0&perPage=3']) {
      const foreign = await request('/' + history.id + tail, 'GET', undefined, 1);
      const absent = await request('/' + randomUUID() + tail, 'GET', undefined, 1);
      const malformed = await request('/malformed' + tail, 'GET', undefined, 1);
      assert.equal(foreign.status, 404); assert.deepEqual(foreign, absent); assert.deepEqual(malformed, absent);
    }
    assert.equal(await fixture.snapshot(), before);
  });
  await t.test('forged owner/filter/cursor inputs and unbounded pages are rejected before mutation', async () => {
    const before = await fixture.snapshot();
    for (const query of [`?resourceId=${users[1]!.id}`, '?cursor=foreign', '?page=-1', '?page=1001', '?perPage=0', '?perPage=51', '?perPage=false', '?page=0&page=1', '?requestContext=forged', '?metadata=forged']) assert.equal((await request(query)).status, 400);
    for (const body of [{ resourceId: users[1]!.id }, { accountId: users[1]!.id }, { threadId: history.id }, { title: 'forged' }, { metadata: {} }]) assert.equal((await request('', 'POST', body)).status, 400);
    assert.equal(await fixture.snapshot(), before);
  });
  for (const kind of ['oversized', 'system'] as const) await t.test(`${kind} native history fails safely without projecting private content`, async () => {
    const saved = await fixture.saveNative(users[0]!.id, [{ role: kind === 'system' ? 'system' : 'user', text: 'Private unsupported history '.repeat(kind === 'oversized' ? 45000 : 1) }]);
    const before = await fixture.snapshot(); const response = await request(`/${saved.id}/messages?page=0&perPage=20`);
    if (kind === 'system') t.diagnostic(`System-only native observation: ${JSON.stringify(response)}`);
    assert.equal(response.status, 503);
    assert.deepEqual(response.value, { error: { code: 'integration_failure', message: 'Native storage unavailable' } });
    assert.ok(JSON.stringify(response.value).length < 256); assert.equal(await fixture.snapshot(), before);
  });
  await t.test('generic mutation/admin/send routes remain closed for either account', async () => {
    const before = await fixture.snapshot();
    for (const who of [0, 1]) for (const [path, method] of [[`/${history.id}`, 'PATCH'], [`/${history.id}`, 'DELETE'], [`/${history.id}/clone`, 'POST'], [`/${history.id}/transfer`, 'POST'], ['/memory/save-messages', 'POST'], ['/api/memory/save-messages', 'POST']] as const) assert.equal((await request(path, method, {}, who)).status, 404);
    assert.equal(await fixture.snapshot(), before);
  });
});
