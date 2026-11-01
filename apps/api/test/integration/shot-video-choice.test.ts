import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';
import { createArtifactStore, createStoryboardEdits, createVersionUses } from '../../src/artifacts/index.js';
import { publishVersion } from '../../src/artifacts/publication.js';
import { createOwnedConversationCheck } from '../../src/agent/index.js';
import { transaction } from '../../src/db/index.js';
import { createNativeConversation } from '../support/native-conversations.js';
import { query } from '../support/postgres.js';
import { testStack } from '../support/test-stack.js';
import { applyArtifactMigrations } from '../support/artifact-database.js';

const script = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'Ada waits for the train.' }] }] };

test('Shot-video choice keeps one exact version per Shot', { timeout: 120000 }, async t => {
  const db = await testStack().testDatabase(), pool = new Pool({ connectionString: db.servingUrl, max: 4, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  const setup = new PostgresStore({ id: 'choice-prerequisite', connectionString: db.setupUrl, schemaName: 'mastra' });
  const native = new PostgresStore({ id: 'choice-serving', schemaName: 'mastra', disableInit: true, pool });
  try {
    await setup.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
    const owner = 'chooser-a', other = 'chooser-b';
    const conversation = (await createNativeConversation(setup, owner)).id, empty = (await createNativeConversation(setup, owner)).id, foreignConversation = (await createNativeConversation(setup, other)).id;
    const check = createOwnedConversationCheck(native), store = createArtifactStore(pool, check), uses = createVersionUses(pool, check), edits = createStoryboardEdits(pool, check);
    // Controlled prerequisites stand in for planning and verified uploads; video upload stays disabled in the product.
    const source = await store.insert({ accountId: owner, conversationId: conversation, kind: 'script', content: script, createdBy: 'human', dependencies: [] });
    const plan = { schemaVersion: 1, sourceScriptVersionId: source.id, shots: [
      { shotId: 's1', order: 0, intent: 'Ada waits.', panels: [{ panelId: 'p1', order: 0, description: 'Ada beneath the clock.', references: [] }] },
      { shotId: 's2', order: 1, intent: 'A train arrives.', panels: [{ panelId: 'p2', order: 0, description: 'The train reaches the platform.', references: [] }] },
    ] };
    const board = await store.insert({ accountId: owner, conversationId: conversation, kind: 'storyboard', content: plan, createdBy: 'human', dependencies: [source.id], use: { binding: { purpose: 'storyboard' }, state: 'approved' } });
    const publish = (account: string, conversationId: string, kind: 'image' | 'video', artifactId?: string) => transaction(pool, client => publishVersion(client, { accountId: account, conversationId, kind, createdBy: 'human', dependencies: [], ...(artifactId ? { artifactId } : {}),
      media: kind === 'video' ? { contentType: 'video/mp4', byteSize: 4096, width: 320, height: 180, durationMs: 2000, hasAudio: true } : { contentType: 'image/png', byteSize: 1024, width: 64, height: 36 } }));
    const [first, second, train, still] = [await publish(owner, conversation, 'video'), await publish(owner, conversation, 'video'), await publish(owner, conversation, 'video'), await publish(owner, conversation, 'image')];
    const foreign = await publish(other, foreignConversation, 'video');
    for (const [version, shotId] of [[first, 's1'], [second, 's1'], [train, 's2']] as const) {
      await pool.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'shot_video','draft')", [owner, conversation, randomUUID(), version.id, { purpose: 'shot_video', shotId }]);
    }
    const fingerprint = async () => (await query(db.servingUrl, `SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.commands) AS commands,(SELECT count(*)::int FROM artifacts.use_changes) AS changes,
      (SELECT COALESCE(jsonb_agg(jsonb_build_array(use_id,version_id,state) ORDER BY use_id),'[]') FROM artifacts.conversation_uses) AS uses,(SELECT COALESCE(max(revision),0)::int FROM artifacts.selection_revisions) AS revision`)).rows[0];
    const shot = async (shotId: string) => (await store.workspace(owner, conversation)).storyboard.shots.find(item => item.shotId === shotId)!;
    const choose = (versionId: string, shotId: string, operationId = randomUUID(), account = owner, target = conversation) => uses.useVersion(account, target, { operationId, versionId, purpose: 'shot_video', shotId });

    await t.test('uploads are listed as candidates, not choices', async () => {
      assert.deepEqual((await shot('s1')).candidateVideoVersions?.map(version => version.id), [first.id, second.id]);
      assert.equal((await shot('s1')).chosenVideoVersionId, null, 'Displayed uploads are candidates, not choices');
    });

    await t.test('invalid, foreign and wrong-target choices change nothing', async () => {
      // Foreign, wrong-kind and wrong-target choices change nothing.
      const beforeRejected = await fingerprint();
      await assert.rejects(choose(still.id, 's1'), { code: 'invalid_input' });
      await assert.rejects(choose(source.id, 's1'), { code: 'invalid_input' });
      await assert.rejects(choose(first.id, 's9'), { code: 'invalid_input' });
      await assert.rejects(choose(first.id, 's1', randomUUID(), owner, empty), { code: 'invalid_input' });
      await assert.rejects(choose(foreign.id, 's1'), { code: 'not_found' });
      await assert.rejects(choose(first.id, 's1', randomUUID(), other, foreignConversation), { code: 'not_found' });
      await assert.rejects(choose(first.id, 's1', randomUUID(), other, conversation), { code: 'not_found' });
      assert.deepEqual(await fingerprint(), beforeRejected);

      // Viewing and reloading never choose.
      await store.workspace(owner, conversation); await store.version(owner, first.id); await store.history(owner, first.artifactId);
      assert.deepEqual(await fingerprint(), beforeRejected);
    });

    await t.test('choose, retry and change keep one exact choice per Shot', async () => {
      const operation = randomUUID();
      const chosen = await choose(first.id, 's1', operation);
      assert.deepEqual([chosen.use.versionId, chosen.use.state, chosen.selectionRevision], [first.id, 'approved', 1]);
      assert.deepEqual(await choose(first.id, 's1', operation), chosen, 'A lost-response retry returns the original choice');
      await assert.rejects(choose(second.id, 's1', operation), { code: 'invalid_input' }, 'An operation identity cannot carry another choice');
      assert.equal((await choose(first.id, 's1')).selectionRevision, 1, 'Re-choosing the current version is not a change');
      const changed = await choose(second.id, 's1');
      assert.equal(changed.selectionRevision, 2);
      assert.equal((await shot('s1')).chosenVideoVersionId, second.id);
      assert.deepEqual((await shot('s1')).candidateVideoVersions?.map(version => version.id), [first.id, second.id], 'The earlier choice stays an exact candidate');
      assert.equal((await choose(train.id, 's2')).selectionRevision, 3);
      // A newer version of the chosen clip's artifact never replaces the exact choice.
      await publish(owner, conversation, 'video', second.artifactId);
      assert.equal((await shot('s1')).chosenVideoVersionId, second.id);
      assert.equal((await shot('s2')).chosenVideoVersionId, train.id, 'Choices are per Shot');
    });

    await t.test('a failure after the revision advance rolls everything back', async () => {
      // A failure after the revision advance leaves no choice, revision, command or journal.
      const failing = randomUUID();
      await query(db.setupUrl, `CREATE FUNCTION artifacts.injected_choice_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected choice failure'; END; $$;
        CREATE TRIGGER injected_choice_failure BEFORE INSERT ON artifacts.use_changes FOR EACH ROW WHEN (NEW.operation_id = '${failing}') EXECUTE FUNCTION artifacts.injected_choice_failure()`);
      const beforeFailure = await fingerprint();
      await assert.rejects(choose(first.id, 's1', failing), /injected choice failure/);
      assert.deepEqual(await fingerprint(), beforeFailure);
    });

    await t.test('concurrent choices and reorders serialize to one revision per change', async () => {
      // Concurrent choices and a reorder serialize: one current choice per Shot and one revision per committed change.
      const raced = await Promise.allSettled([
        choose(first.id, 's1'), choose(second.id, 's1'),
        edits.editStoryboard(owner, conversation, { operationId: randomUUID(), baseVersionId: board.id, shots: [{ shotId: 's2', order: 0, panels: [{ panelId: 'p2', order: 0, references: [] }] }, { shotId: 's1', order: 1, panels: [{ panelId: 'p1', order: 0, references: [] }] }] }),
      ]);
      for (const result of raced) if (result.status === 'rejected') assert.equal((result.reason as { code?: string }).code, 'stale_revision');
      const approved = (await query(db.servingUrl, "SELECT binding->>'shotId' AS shot,count(*)::int AS count FROM artifacts.conversation_uses WHERE purpose='shot_video' AND state='approved' GROUP BY 1 ORDER BY 1")).rows;
      assert.deepEqual(approved, [{ shot: 's1', count: 1 }, { shot: 's2', count: 1 }]);
      const journal = (await query(db.servingUrl, "SELECT count(*) FILTER (WHERE c.selection_revision IS NOT NULL)::int AS choices,(SELECT count(*)::int FROM artifacts.manual_changes WHERE selection_revision IS NOT NULL) AS edits FROM artifacts.use_changes c")).rows[0];
      assert.equal((await store.workspace(owner, conversation)).selectionRevision, journal?.choices + journal?.edits, 'Every revision belongs to exactly one journalled change');
    });

    await t.test('SQL keeps one approved choice per Shot', async () => {
      // With planning fixed, concurrent choices for one Shot both commit in some order and leave one current choice.
      const pair = await Promise.allSettled([choose(first.id, 's2'), choose(second.id, 's2')]);
      assert.deepEqual(pair.map(result => result.status), ['fulfilled', 'fulfilled']);
      assert.ok([first.id, second.id].includes((await shot('s2')).chosenVideoVersionId!));
      await assert.rejects(query(db.servingUrl, `UPDATE artifacts.conversation_uses SET state='approved' WHERE purpose='shot_video' AND state='draft' AND binding->>'shotId'='s2'`), /one_approved_choice/, 'SQL keeps one approved choice per Shot');

      const repeat = (await query(db.servingUrl, `SELECT previous_version_id,version_id,selection_revision FROM artifacts.use_changes WHERE version_id='${first.id}' ORDER BY created_at LIMIT 2`)).rows;
      assert.deepEqual(repeat.map(row => [row.previous_version_id, row.version_id, row.selection_revision]), [[null, first.id, '1'], [first.id, first.id, null]], 'A first choice and a no-op re-choice are distinguishable');
    });
  } finally { await native.close(); if (!pool.ended) await pool.end(); await setup.close(); await db.close(); }
});
