import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApiClient } from '@workprint/api-client';
import type { OperationRequest } from '@workprint/contracts';
import { accountBrowserFixture } from '../support/account-browser-fixture.js';
import { prepareManualSavedWork } from '../support/manual-saved-work.js';
import { createNativeConversation } from '../support/native-conversations.js';
import { prepareBuiltInScript } from '../support/built-in-work.js';

type Command = OperationRequest<'useVersion'>;
const command = (conversation: string, versionId: string, binding: { purpose: 'script' | 'storyboard' } | { purpose: 'reference'; role: string }): Command => ({ params: { id: conversation }, query: {}, body: { ...binding, operationId: randomUUID(), versionId } });

// Sealing and immutability rules are proven in integration/built-ins.
test('Library reuse over HTTP', { timeout: 180000 }, async t => {
  const fixture = await accountBrowserFixture({ artifacts: true }); t.after(fixture.close);
  const users = await Promise.all([fixture.auth.createAccount(), fixture.auth.createAccount()]);
  const setup = { accountIds: users.map(user => user.id), native: fixture.native, servingUrl: fixture.servingUrl, setupUrl: fixture.setupUrl };
  const saved = await prepareManualSavedWork(setup);
  const foreignConversation = (await createNativeConversation(fixture.native, saved.foreignAccountId)).id;
  const builtin = await prepareBuiltInScript(setup);
  const tokens = await Promise.all(users.map(user => fixture.accessToken(user)));
  const client = createApiClient({ baseUrl: fixture.apiOrigin, getAccessToken: async () => tokens[0]! });
  const foreign = createApiClient({ baseUrl: fixture.apiOrigin, getAccessToken: async () => tokens[1]! });
  const original = command(saved.conversationId, saved.script.id, { purpose: 'script' });

  await t.test('using an exact version pins it, and concurrent retries return the same use', async () => {
    const first = await client.useVersion(original);
    assert.ok(first.ok); assert.equal(first.value.use.versionId, saved.script.id); assert.equal(first.value.use.state, 'approved');
    for (const result of await Promise.all(Array.from({ length: 4 }, () => client.useVersion(original)))) assert.deepEqual(result, first);
  });

  await t.test('a newer Library version does not move a pinned use', async () => {
    assert.ok('content' in saved.script);
    const content = structuredClone(saved.script.content) as { schemaVersion: number; scenes: { script: { action: string }[] }[] };
    content.scenes[0]!.script[0]!.action = 'Ada checks her ticket before the train arrives.';
    const newer = await client.saveVersion({ params: { id: saved.otherConversationId }, query: {}, body: { operationId: randomUUID(), artifactId: saved.script.artifactId, baseVersionId: saved.script.id, kind: 'script', content, dependencies: saved.script.dependencies } });
    assert.ok(newer.ok); assert.equal(newer.value.use, undefined);
    const work = await client.workspace({ params: { id: saved.conversationId }, query: {}, body: {} });
    assert.ok(work.ok); assert.equal(work.value.script?.version.id, saved.script.id);
  });

  await t.test('another account cannot use or read into this conversation', async () => {
    for (const denied of [await foreign.useVersion(original), await client.useVersion(command(foreignConversation, saved.script.id, { purpose: 'script' }))]) {
      assert.ok(!denied.ok); assert.equal(denied.error.code, 'not_found');
    }
  });

  await t.test('a built-in version is reusable by any account but cannot be edited', async () => {
    for (const [reader, conversation] of [[client, saved.conversationId], [foreign, foreignConversation]] as const) {
      const example = await reader.version({ params: { id: builtin.id }, query: {}, body: {} });
      assert.ok(example.ok); assert.equal(example.value.builtIn, true);
      assert.ok((await reader.useVersion(command(conversation, builtin.id, { purpose: 'script' }))).ok);
      const reopened = await reader.workspace({ params: { id: conversation }, query: {}, body: {} });
      assert.ok(reopened.ok); assert.equal(reopened.value.script?.version.id, builtin.id);
      assert.ok('content' in builtin);
      const denied = await reader.saveVersion({ params: { id: conversation }, query: {}, body: { operationId: randomUUID(), artifactId: builtin.artifactId, baseVersionId: builtin.id, kind: 'script', content: builtin.content, dependencies: [] } });
      assert.ok(!denied.ok); assert.equal(denied.error.code, 'invalid_input');
    }
  });
});
