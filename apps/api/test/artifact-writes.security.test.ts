import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';
import type { OperationRequest } from '@workprint/contracts';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { createArtifactStore, createArtifactWriters } from '../src/artifacts/index.js';
import { createNativeConversation } from './native-conversations.js';
import { isolatedPostgres, query } from './postgres.js';
import { applyArtifactMigrations } from './artifact-database.js';

type Command = OperationRequest<'saveVersion'>['body'];
const script = (action: string) => ({ schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action }] }] });

test('transactional writers enforce separate producer capabilities, immutable command identity and rollback of every effect', { timeout: 120000 }, async () => {
  const db = await isolatedPostgres();
  const pool = new Pool({ connectionString: db.servingUrl, max: 4, connectionTimeoutMillis: 1000, statement_timeout: 2000, application_name: 'artifact-command-qualification' });
  const native = new PostgresStore({ id: 'artifact-writers-setup', connectionString: db.setupUrl, schemaName: 'mastra' });
  try {
    await native.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
    const a = await createNativeConversation(native, 'writer-a');
    const empty = await createNativeConversation(native, 'writer-a');
    const b = await createNativeConversation(native, 'writer-b');
    const nativeCheck = createOwnedConversationCheck(native);
    const check: typeof nativeCheck = async (account, conversation) => {
      const active = (await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='artifact-command-qualification' AND state LIKE 'idle in transaction%'")).rows[0]!.count;
      assert.equal(active, 0, 'Native authorization must run before acquiring a SQL transaction');
      return nativeCheck(account, conversation);
    };
    const store = createArtifactStore(pool, check);
    const writers = createArtifactWriters(pool, check);
    const first = await store.insert({ accountId: 'writer-a', conversationId: a.id, kind: 'script', createdBy: 'human', content: script('Ada waits.'), dependencies: [], use: { binding: { purpose: 'script' }, state: 'approved' } });
    const base = await store.insert({ accountId: 'writer-a', conversationId: a.id, artifactId: first.artifactId, kind: 'script', createdBy: 'assistant', content: script('Ada looks toward the platform.'), dependencies: [first.id] });
    const foreign = await store.insert({ accountId: 'writer-b', conversationId: b.id, kind: 'script', createdBy: 'human', content: script('A different traveller waits.'), dependencies: [] });
    const command: Command = { operationId: randomUUID(), artifactId: base.artifactId, baseVersionId: base.id, kind: 'script', content: script('Ada checks her watch.'), dependencies: [first.id], intendedUse: { purpose: 'script' } };
    const fingerprint = async () => (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='artifacts' ORDER BY tablename")).rows.reduce(async (previous: Promise<unknown[]>, row: { tablename: string }) => [...await previous, [row.tablename, (await pool.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS digest FROM artifacts."${row.tablename}" t`)).rows]], Promise.resolve([]));
    const before = await fingerprint();
    const impersonated = { ...command, createdBy: 'human' };
    for (const attempt of [
      () => writers.assistant.save('writer-a', a.id, command),
      () => writers.assistant.save('writer-a', a.id, impersonated),
      () => writers.human.save('writer-a', a.id, { ...command, dependencies: [] }),
      () => writers.human.save('writer-a', a.id, { ...command, content: { ...script('Ada checks her watch.'), scenes: [] } }),
    ]) await assert.rejects(attempt, { code: 'invalid_input' });
    for (const dependencies of [[foreign.id], ['unknown']]) await assert.rejects(writers.human.save('writer-a', a.id, { ...command, dependencies }), { code: 'not_found', message: 'Saved work not found' });
    await assert.rejects(writers.human.save('writer-a', b.id, command), { code: 'not_found' });
    assert.deepEqual(await fingerprint(), before);

    await query(db.setupUrl, "CREATE FUNCTION artifacts.fixture_write_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Owned rollback control'; END $$");
    for (const table of ['versions', 'version_dependencies', 'conversation_uses', 'commands', 'manual_changes']) {
      await query(db.setupUrl, `CREATE TRIGGER fixture_write_failure AFTER INSERT OR UPDATE ON artifacts.${table} FOR EACH ROW EXECUTE FUNCTION artifacts.fixture_write_failure()`);
      try {
        await assert.rejects(writers.human.save('writer-a', a.id, command), /Owned rollback control/, `Rollback after ${table}`);
        assert.deepEqual(await fingerprint(), before, `No partial command, publication, version, dependency, use or change after ${table}`);
      } finally { await query(db.setupUrl, `DROP TRIGGER fixture_write_failure ON artifacts.${table}`); }
    }
    await query(db.setupUrl, 'DROP FUNCTION artifacts.fixture_write_failure()');
    const saved = await writers.human.save('writer-a', a.id, command);
    assert.equal(saved.version.revision, 3); assert.equal(saved.use?.state, 'approved');
    const after = await fingerprint();
    assert.deepEqual(await writers.human.save('writer-a', a.id, command), saved);
    await assert.rejects(writers.human.save('writer-a', a.id, { ...command, content: script('A different payload with the same identity.') }), { code: 'invalid_input' });
    assert.deepEqual(await fingerprint(), after);
    const { intendedUse, ...draftCommand } = command;
    assert.deepEqual(intendedUse, { purpose: 'script' });
    const draft = await writers.assistant.save('writer-a', a.id, { ...draftCommand, operationId: randomUUID(), baseVersionId: saved.version.id });
    assert.equal(draft.version.createdBy, 'assistant'); assert.equal(draft.use, undefined);
    assert.equal((await store.workspace('writer-a', a.id)).script?.version.id, saved.version.id, 'Assistant draft cannot move the pinned approved human use');
    const detached = await writers.human.save('writer-a', empty.id, { ...draftCommand, baseVersionId: draft.version.id });
    assert.equal(detached.use, undefined, 'Owner/conversation command context permits a distinct save, without inventing a use');
    assert.equal((await store.workspace('writer-a', empty.id)).script, null);
    assert.deepEqual(await writers.human.save('writer-a', a.id, command), saved, 'Old retries return their original result without reapplying decisions');
    assert.equal((await store.workspace('writer-a', a.id)).script?.version.id, saved.version.id);
    const changes = (await pool.query('SELECT count(*)::int AS changes,count(use_id)::int AS decisions FROM artifacts.manual_changes')).rows;
    assert.deepEqual(changes, [{ changes: 2, decisions: 1 }], 'Assistant writes create neither manual changes nor human decisions');
    const reference = await store.insert({ accountId: 'writer-a', conversationId: a.id, kind: 'reference', createdBy: 'human', dependencies: [], content: { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada reference', description: 'A traveller in a green coat.', continuityNotes: ['Keep the coat.'] }, references: [] }, use: { binding: { purpose: 'reference', role: 'ada' }, state: 'draft' } });
    assert.ok('content' in reference);
    const referenceContent = { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada reference', description: 'A traveller carrying a small case.', continuityNotes: ['Keep the coat.'] }, references: [] };
    const referenceSaved = await writers.human.save('writer-a', a.id, { operationId: randomUUID(), artifactId: reference.artifactId, baseVersionId: reference.id, kind: 'reference', content: referenceContent, dependencies: [], intendedUse: { purpose: 'reference', role: 'ada' } });
    assert.equal(referenceSaved.use?.state, 'approved');
    assert.ok('content' in referenceSaved.version); assert.deepEqual(referenceSaved.version.content, referenceContent);
    const planContent = { schemaVersion: 1, sourceScriptVersionId: first.id, shots: [
      { shotId: 's1', order: 0, intent: 'Ada waits.', panels: [{ panelId: 'p1', order: 0, description: 'Ada beneath the clock.', references: [referenceSaved.version.id] }] },
      { shotId: 's2', order: 1, intent: 'A train arrives.', panels: [{ panelId: 'p2', order: 0, description: 'The train reaches the platform.', references: [] }] },
    ] };
    const planning = await store.insert({ accountId: 'writer-a', conversationId: a.id, kind: 'storyboard', createdBy: 'human', content: planContent, dependencies: [first.id, referenceSaved.version.id], use: { binding: { purpose: 'storyboard' }, state: 'approved' } });
    const planCommand: Command = { operationId: randomUUID(), artifactId: planning.artifactId, baseVersionId: planning.id, kind: 'storyboard', content: planContent, dependencies: planning.dependencies, intendedUse: { purpose: 'storyboard' } };
    const beforePlanning = await fingerprint();
    for (const content of [
      { ...planContent, shots: [...planContent.shots].reverse() },
      { ...planContent, shots: planContent.shots.map(shot => ({ ...shot, order: 1 - shot.order })) },
      { ...planContent, shots: planContent.shots.map(shot => ({ ...shot, panels: shot.panels.map(panel => ({ ...panel, references: [] })) })) },
    ]) await assert.rejects(writers.human.save('writer-a', a.id, { ...planCommand, content }), { code: 'invalid_input' });
    assert.deepEqual(await fingerprint(), beforePlanning, 'Generic manual planning saves cannot change order, identity or exact references');
    const editedContent = { ...planContent, shots: planContent.shots.map(shot => ({ ...shot, intent: shot.intent + ' She holds her ticket.', panels: shot.panels.map(panel => ({ ...panel, description: panel.description + ' The light is soft.' })) })) };
    const planningSaved = await writers.human.save('writer-a', a.id, { ...planCommand, content: editedContent });
    assert.equal(planningSaved.use?.state, 'approved');
    assert.ok('content' in planningSaved.version); assert.deepEqual(planningSaved.version.content, editedContent);
    assert.equal((await store.workspace('writer-a', a.id)).selectionRevision, 0, 'Text-only planning save does not fabricate selection authority');
    const reorderedContent = { ...editedContent, shots: editedContent.shots.map(shot => ({ ...shot, order: 1 - shot.order })) };
    const reorderedDraft = await writers.assistant.save('writer-a', a.id, { ...draftCommand, operationId: randomUUID(), artifactId: planning.artifactId, baseVersionId: planningSaved.version.id, kind: 'storyboard', dependencies: planning.dependencies, content: reorderedContent });
    const afterDraft = await fingerprint();
    await assert.rejects(writers.human.save('writer-a', a.id, { ...planCommand, operationId: randomUUID(), baseVersionId: reorderedDraft.version.id, content: reorderedContent }), { code: 'invalid_input' }, 'A text save must not promote reordered draft planning into an approved use without selection-revision authority');
    assert.deepEqual(await fingerprint(), afterDraft, 'Rejected promotion has no partial version/use/change effects');
    assert.equal((await store.workspace('writer-a', a.id)).storyboard.work?.version.id, planningSaved.version.id);
    const beforeReads = await fingerprint();
    await store.workspace('writer-a', a.id); await store.history('writer-a', base.artifactId); await store.version('writer-a', detached.version.id); await store.library('writer-a');
    assert.deepEqual(await fingerprint(), beforeReads, 'Reading workspace/history never consumes pending manual changes');
    for (const sql of ['UPDATE artifacts.commands SET result=result', 'DELETE FROM artifacts.manual_changes', "UPDATE artifacts.conversation_uses SET binding='{}'"]) await assert.rejects(query(db.servingUrl, sql));
  } finally { await native.close(); if (!pool.ended) await pool.end(); await db.close(); }
});
