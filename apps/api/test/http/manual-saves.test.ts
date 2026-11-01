import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApiClient } from '@workprint/api-client';
import { accountBrowserFixture } from '../support/account-browser-fixture.js';
import { prepareOwnedSavedWork } from '../support/saved-work.js';

const script = (action: string) => ({ schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action }] }] });

// Domain rules (replay, conflicts, foreign denial, rollback) are proven in integration/artifact-writes.
test('manual saves over HTTP', { timeout: 180000 }, async t => {
  const fixture = await accountBrowserFixture({ artifacts: true }); t.after(fixture.close);
  const users = await Promise.all([fixture.auth.createAccount(), fixture.auth.createAccount()]);
  const saved = await prepareOwnedSavedWork({ accountIds: users.map(user => user.id), native: fixture.native, servingUrl: fixture.servingUrl });
  const token = await fixture.accessToken(users[0]!);
  const client = createApiClient({ baseUrl: fixture.apiOrigin, getAccessToken: async () => token });
  const base = saved.scriptVersions[2]!;
  const input = { params: { id: saved.conversationA }, query: {}, body: { operationId: randomUUID(), artifactId: base.artifactId, baseVersionId: base.id, kind: 'script' as const, content: script('Ada pauses beneath the clock.'), dependencies: base.dependencies, intendedUse: { purpose: 'script' as const } } };
  let latest = base.id;

  await t.test('a save creates the next version and the workspace uses it', async () => {
    const result = await client.saveVersion(input);
    assert.ok(result.ok); assert.equal(result.value.version.revision, 4); assert.equal(result.value.use?.state, 'approved');
    const workspace = await client.workspace({ params: input.params, query: {}, body: {} });
    assert.ok(workspace.ok); assert.equal(workspace.value.script?.version.id, result.value.version.id);
    const history = await client.artifactVersions({ params: { id: base.artifactId }, query: {}, body: {} });
    assert.ok(history.ok); assert.deepEqual(history.value.items.map(version => version.revision), [4, 3, 2, 1]);
    latest = result.value.version.id;
  });

  await t.test('two concurrent saves from the same base commit exactly one', async () => {
    const concurrent = await Promise.all(['Ada checks the platform.', 'Ada checks the station clock.'].map(action => client.saveVersion({ ...input, body: { ...input.body, operationId: randomUUID(), baseVersionId: latest, content: script(action) } })));
    const winner = concurrent.find(item => item.ok), loser = concurrent.find(item => !item.ok);
    assert.ok(winner?.ok); assert.ok(loser && !loser.ok); assert.equal(loser.error.code, 'stale_revision');
    latest = winner.value.version.id;
  });

  await t.test('a retry after a lost response returns the committed version', async () => {
    const lostInput = { ...input, body: { ...input.body, operationId: randomUUID(), baseVersionId: latest, content: script('Ada keeps her ticket in her coat pocket.') } };
    const actualFetch = globalThis.fetch;
    const loss = t.mock.method(globalThis, 'fetch', async (...args: Parameters<typeof fetch>) => {
      const response = await actualFetch(...args);
      assert.equal(response.status, 200, 'Response loss happens only after the real command committed');
      await response.arrayBuffer();
      throw new TypeError('Owned post-commit response-loss control');
    });
    try {
      const lost = await client.saveVersion(lostInput);
      assert.ok(!lost.ok); assert.equal(lost.error.code, 'transport_failure');
    } finally { loss.mock.restore(); }
    const recovered = await client.saveVersion(lostInput);
    assert.ok(recovered.ok); assert.equal(recovered.value.version.revision, 6);
    const history = await client.artifactVersions({ params: { id: base.artifactId }, query: {}, body: {} });
    assert.ok(history.ok); assert.deepEqual(history.value.items.map(version => version.revision), [6, 5, 4, 3, 2, 1]);
  });
});
