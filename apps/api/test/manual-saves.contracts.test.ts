import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { query } from './postgres.js';
import { createApiClient } from '@workprint/api-client';
import { verifyBuiltAdmission } from './auth-built-fixture.js';
import { prepareOwnedSavedWork, type OwnedSavedWork } from './saved-work.js';

const script = (action: string) => ({ schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action }] }] });
test('built manual save persists one exact approved effect, rejects stale and foreign commands and replays the original result', { timeout: 180000 }, async t => {
  let saved: OwnedSavedWork | undefined;
  await verifyBuiltAdmission(t, async target => {
    assert.ok(saved);
    const client = createApiClient({ baseUrl: target.origin, getAccessToken: async () => target.accessTokens[0]! });
    const foreign = createApiClient({ baseUrl: target.origin, getAccessToken: async () => target.accessTokens[1]! });
    const base = saved.scriptVersions[2]!;
    const input = { params: { id: saved.conversationA }, query: {}, body: { operationId: randomUUID(), artifactId: base.artifactId, baseVersionId: base.id, kind: 'script' as const, content: script('Ada pauses beneath the clock, then turns toward the platform.'), dependencies: base.dependencies, intendedUse: { purpose: 'script' as const } } };
    const result = await client.saveVersion(input);
    assert.ok(result.ok, 'A valid existing-content human save must replace 501');
    assert.equal(result.value.version.revision, 4); assert.equal(result.value.version.createdBy, 'human');
    assert.ok('content' in result.value.version); assert.deepEqual(result.value.version.content, input.body.content);
    assert.equal(result.value.use?.versionId, result.value.version.id); assert.equal(result.value.use.state, 'approved');
    assert.deepEqual(await client.saveVersion(input), result, 'Identical retry returns the original version and exact use');
    const conflict = await client.saveVersion({ ...input, body: { ...input.body, content: script('A conflicting payload.') } });
    assert.ok(!conflict.ok); assert.equal(conflict.error.code, 'invalid_input');
    const stale = await client.saveVersion({ ...input, body: { ...input.body, operationId: randomUUID() } });
    assert.ok(!stale.ok); assert.equal(stale.error.code, 'stale_revision');
    const denied = await foreign.saveVersion(input);
    assert.ok(!denied.ok); assert.equal(denied.error.code, 'not_found');
    const invalidDependency = await client.saveVersion({ ...input, body: { ...input.body, operationId: randomUUID(), baseVersionId: result.value.version.id, dependencies: [saved.foreign.id] } });
    assert.ok(!invalidDependency.ok); assert.equal(invalidDependency.error.code, 'not_found');
    const workspace = await client.workspace({ params: input.params, query: {}, body: {} });
    assert.ok(workspace.ok); assert.equal(workspace.value.script?.version.id, result.value.version.id); assert.equal(workspace.value.script?.state, 'Ready');
    const exact = await client.version({ params: { id: result.value.version.id }, query: {}, body: {} });
    assert.ok(exact.ok); assert.deepEqual(exact.value, result.value.version);
    const history = await client.artifactVersions({ params: { id: base.artifactId }, query: {}, body: {} });
    assert.ok(history.ok); assert.deepEqual(history.value.items.map(version => version.revision), [4, 3, 2, 1]);
    const concurrent = await Promise.all(['Ada checks the platform.', 'Ada checks the station clock.'].map(action => client.saveVersion({ ...input, body: { ...input.body, operationId: randomUUID(), baseVersionId: result.value.version.id, content: script(action) } })));
    assert.equal(concurrent.filter(item => item.ok).length, 1, 'Only one concurrent latest-base command commits');
    const winner = concurrent.find(item => item.ok); assert.ok(winner?.ok);
    const loser = concurrent.find(item => !item.ok); assert.ok(loser && !loser.ok); assert.equal(loser.error.code, 'stale_revision');
    assert.equal(winner.value.version.revision, 5);
    assert.deepEqual(await client.saveVersion(input), result, 'Original retry remains stable after a later human decision');
    const afterRetry = await client.workspace({ params: input.params, query: {}, body: {} });
    assert.ok(afterRetry.ok); assert.equal(afterRetry.value.script?.version.id, winner.value.version.id, 'An old successful retry must not repin its returned use');
    const { intendedUse, ...withoutUse } = input.body;
    assert.deepEqual(intendedUse, { purpose: 'script' });
    const detached = await client.saveVersion({ ...input, body: { ...withoutUse, operationId: randomUUID(), baseVersionId: winner.value.version.id, content: script('A saved alternative without an intended-use decision.') } });
    assert.ok(detached.ok); assert.equal(detached.value.version.revision, 6); assert.equal(detached.value.use, undefined);
    const detachedWork = await client.workspace({ params: input.params, query: {}, body: {} });
    assert.ok(detachedWork.ok); assert.equal(detachedWork.value.script?.version.id, winner.value.version.id);
    const lostInput = { ...input, body: { ...input.body, operationId: randomUUID(), baseVersionId: detached.value.version.id, content: script('Ada keeps her ticket in her coat pocket.') } };
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
    assert.ok(recovered.ok); assert.equal(recovered.value.version.revision, 7);
    assert.deepEqual(await client.saveVersion(lostInput), recovered, 'Lost response retry never creates version 8');
    const finalHistory = await client.artifactVersions({ params: { id: base.artifactId }, query: {}, body: {} });
    assert.ok(finalHistory.ok); assert.deepEqual(finalHistory.value.items.map(version => version.revision), [7, 6, 5, 4, 3, 2, 1]);
  }, {
    prepareSavedWork: async setup => { saved = await prepareOwnedSavedWork(setup); },
    verifySavedEffects: async servingUrl => {
      const counts = (await query(servingUrl, 'SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.commands) AS commands,(SELECT count(*)::int FROM artifacts.manual_changes) AS changes')).rows;
      assert.deepEqual(counts, [{ versions: 9, commands: 4, changes: 4 }], 'Each successful command commits once; failed and replayed commands add no rows');
      const effects = (await query(servingUrl, 'SELECT count(*)::int AS changes,count(use_id)::int AS decisions FROM artifacts.manual_changes')).rows;
      assert.deepEqual(effects, [{ changes: 4, decisions: 3 }]);
    },
  });
});
