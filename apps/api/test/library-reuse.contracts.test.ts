import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApiClient } from '@workprint/api-client';
import type { OperationRequest, Version } from '@workprint/contracts';
import { verifyBuiltAdmission } from './auth-built-fixture.js';
import { prepareManualSavedWork, type ManualSavedWork } from './manual-saved-work.js';
import { createNativeConversation } from './native-conversations.js';
import { query } from './postgres.js';
import { prepareBuiltInScript } from './built-in-work.js';

test('built Library reuse pins exact independent uses without copies, implicit latest or replayed decisions', { timeout: 180000 }, async t => {
  let saved: ManualSavedWork | undefined, builtin: Version | undefined, foreignConversation = '';
  await verifyBuiltAdmission(t, async target => {
    assert.ok(saved);
    const client = createApiClient({ baseUrl: target.origin, getAccessToken: async () => target.accessTokens[0]! });
    const foreign = createApiClient({ baseUrl: target.origin, getAccessToken: async () => target.accessTokens[1]! });
    const anonymous = createApiClient({ baseUrl: target.origin, getAccessToken: async () => null });
    type Command = OperationRequest<'useVersion'>;
    const command = (conversation: string, versionId: string, binding: { purpose: 'script' | 'storyboard' } | { purpose: 'reference'; role: string }): Command => ({ params: { id: conversation }, query: {}, body: { ...binding, operationId: randomUUID(), versionId } });
    const original = command(saved.conversationId, saved.script.id, { purpose: 'script' });
    const first = await client.useVersion(original);
    assert.ok(first.ok, 'Human exact-version use must replace the unavailable boundary');
    assert.equal(first.value.use.versionId, saved.script.id); assert.equal(first.value.use.state, 'approved');
    assert.deepEqual(first.value.use.binding, { purpose: 'script' }); assert.equal(first.value.selectionRevision, 0);
    const concurrent = await Promise.all(Array.from({ length: 8 }, () => client.useVersion(original)));
    for (const result of concurrent) assert.deepEqual(result, first, 'Concurrent identical retries reconcile one immutable result');
    const second = await client.useVersion(command(saved.otherConversationId, saved.script.id, { purpose: 'script' }));
    assert.ok(second.ok); assert.notEqual(second.value.use.id, first.value.use.id);
    const references = [];
    for (const conversation of [saved.conversationId, saved.otherConversationId]) {
      const reference = await client.useVersion(command(conversation, saved.reference.id, { purpose: 'reference', role: 'lead' }));
      assert.ok(reference.ok); assert.deepEqual(reference.value.use.binding, { purpose: 'reference', role: 'lead' }); references.push(reference.value.use);
      const board = await client.useVersion(command(conversation, saved.planning.id, { purpose: 'storyboard' }));
      assert.ok(board.ok); assert.equal(board.value.use.versionId, saved.planning.id);
    }
    assert.notEqual(references[0]!.id, references[1]!.id);
    const before = await client.workspace({ params: { id: saved.conversationId }, query: {}, body: {} });
    assert.ok(before.ok); assert.equal(before.value.assets.find(work => work.use?.binding.purpose === 'reference' && work.use.binding.role === 'ada')?.state, 'Draft', 'Approving a different role cannot promote the original Draft use');
    const version = await client.version({ params: { id: saved.script.id }, query: {}, body: {} });
    assert.ok(version.ok); assert.deepEqual(version.value, saved.script);
    assert.ok('content' in saved.script);
    const content = structuredClone(saved.script.content) as { schemaVersion: number; scenes: { script: { action: string }[] }[] };
    content.scenes[0]!.script[0]!.action = 'Ada checks her ticket before the train arrives.';
    const newer = await client.saveVersion({ params: { id: saved.conversationId }, query: {}, body: { operationId: randomUUID(), artifactId: saved.script.artifactId, baseVersionId: saved.script.id, kind: 'script', content, dependencies: saved.script.dependencies } });
    assert.ok(newer.ok); assert.equal(newer.value.version.revision, 2); assert.equal(newer.value.use, undefined);
    for (const id of [saved.conversationId, saved.otherConversationId]) {
      const work = await client.workspace({ params: { id }, query: {}, body: {} });
      assert.ok(work.ok); assert.equal(work.value.script?.version.id, saved.script.id, 'A newer Library version cannot move either pinned use');
      assert.equal(work.value.storyboard.shots[0]?.chosenVideoVersionId, null);
      assert.equal(work.value.storyboard.shots[0]?.panels[0]?.approvedImageVersionId, null);
    }
    const moved = await client.useVersion(command(saved.conversationId, newer.value.version.id, { purpose: 'script' }));
    assert.ok(moved.ok); assert.equal(moved.value.use.id, first.value.use.id);
    assert.deepEqual(await client.useVersion(original), first, 'Retry reports its original approved use without repinning a later decision');
    const conflict = await client.useVersion({ ...original, body: { ...original.body, versionId: newer.value.version.id } });
    assert.ok(!conflict.ok); assert.equal(conflict.error.code, 'invalid_input');
    for (const denied of [await foreign.useVersion(original), await foreign.useVersion(command(foreignConversation, saved.script.id, { purpose: 'script' })), await client.useVersion(command(foreignConversation, saved.script.id, { purpose: 'script' })), await client.useVersion(command(saved.conversationId, randomUUID(), { purpose: 'script' }))]) {
      assert.ok(!denied.ok); assert.equal(denied.error.code, 'not_found');
    }
    const auth = await anonymous.useVersion(original); assert.ok(!auth.ok); assert.equal(auth.error.code, 'unauthenticated');
    for (const binding of [{ purpose: 'reference' as const, role: 'lead' }, { purpose: 'storyboard' as const }]) {
      const wrong = await client.useVersion(command(saved.conversationId, saved.script.id, binding));
      assert.ok(!wrong.ok); assert.equal(wrong.error.code, 'invalid_input');
    }
    const future = await client.useVersion({ params: original.params, query: {}, body: { operationId: randomUUID(), versionId: saved.script.id, purpose: 'shot_video', shotId: 'station-shot' } });
    assert.ok(!future.ok); assert.equal(future.error.code, 'invalid_input', 'A Script version can never become a Shot-video choice');
    const latest = await client.library({ params: {}, query: { kind: 'script', limit: 1 }, body: {} });
    assert.ok(latest.ok); assert.equal(latest.value.items[0]?.latestVersion.id, newer.value.version.id);
    assert.equal(Object.hasOwn(latest.value.items[0]!, 'state'), false, 'Library summaries have no conversation-specific approval state');
    const history = await client.artifactVersions({ params: { id: saved.script.artifactId }, query: { limit: 1 }, body: {} });
    assert.ok(history.ok); assert.equal(history.value.items[0]?.id, newer.value.version.id);
    const after = await client.workspace({ params: { id: saved.conversationId }, query: {}, body: {} });
    assert.ok(after.ok); assert.equal(after.value.script?.version.id, newer.value.version.id);
    const untouched = await client.workspace({ params: { id: saved.otherConversationId }, query: {}, body: {} });
    assert.ok(untouched.ok); assert.equal(untouched.value.script?.version.id, saved.script.id);
    assert.ok(builtin);
    for (const [reader, conversation] of [[client, saved.conversationId], [foreign, foreignConversation]] as const) {
      const example = await reader.version({ params: { id: builtin.id }, query: {}, body: {} });
      assert.ok(example.ok); assert.equal(example.value.builtIn, true, 'Stored source immutability is projected through the real authenticated backend');
      const reuse = await reader.useVersion(command(conversation, builtin.id, { purpose: 'script' })); assert.ok(reuse.ok);
      const reopened = await reader.workspace({ params: { id: conversation }, query: {}, body: {} });
      assert.ok(reopened.ok); assert.equal(reopened.value.script?.version.builtIn, true); assert.equal(reopened.value.script.version.id, builtin.id);
      const denied = await reader.saveVersion({ params: { id: conversation }, query: {}, body: { operationId: randomUUID(), artifactId: builtin.artifactId, baseVersionId: builtin.id, kind: 'script', content, dependencies: [] } });
      assert.ok(!denied.ok); assert.equal(denied.error.code, 'invalid_input');
    }
  }, {
    prepareSavedWork: async setup => { saved = await prepareManualSavedWork(setup); foreignConversation = (await createNativeConversation(setup.native, saved.foreignAccountId)).id; builtin = await prepareBuiltInScript(setup); },
    verifySavedEffects: async servingUrl => {
      assert.deepEqual((await query(servingUrl, "SELECT (SELECT count(*)::int FROM artifacts.artifacts) AS artifacts,(SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.commands WHERE command_kind='use_version') AS approvals,(SELECT count(*)::int FROM artifacts.commands WHERE command_kind='manual_save') AS saves,(SELECT count(*)::int FROM artifacts.conversation_uses) AS uses")).rows, [{ artifacts: 4, versions: 5, approvals: 9, saves: 1, uses: 8 }]);
    },
  });
});
