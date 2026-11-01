import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';
import type { OperationRequest, Version } from '@workprint/contracts';
import { createArtifactStore, createArtifactWriters, createStoryboardEdits, createVersionUses } from '../src/artifacts/index.js';
import { publishVersion } from '../src/artifacts/publication.js';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { transaction } from '../src/db/index.js';
import { createNativeConversation } from './native-conversations.js';
import { isolatedPostgres, query } from './postgres.js';
import { applyArtifactMigrations } from './artifact-database.js';

type Edit = OperationRequest<'editStoryboard'>['body'];
const script = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'Ada waits for the train.' }] }] };
const reference = (name: string) => ({ schemaVersion: 1, subject: { id: name.toLowerCase(), kind: 'character', name, description: `${name} in a green coat.`, continuityNotes: ['Keep the coat.'] }, references: [] });

test('storyboard edits keep stable Shot/Panel identities, advance one selection revision only on order changes and record exact affected work', { timeout: 120000 }, async () => {
  const db = await isolatedPostgres(), pool = new Pool({ connectionString: db.servingUrl, max: 4, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  const setup = new PostgresStore({ id: 'storyboard-prerequisite', connectionString: db.setupUrl, schemaName: 'mastra' });
  const native = new PostgresStore({ id: 'storyboard-serving', schemaName: 'mastra', disableInit: true, pool });
  try {
    await setup.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
    const owner = 'planner-a', other = 'planner-b';
    const conversation = (await createNativeConversation(setup, owner)).id, empty = (await createNativeConversation(setup, owner)).id, foreignConversation = (await createNativeConversation(setup, other)).id;
    const check = createOwnedConversationCheck(native), store = createArtifactStore(pool, check), uses = createVersionUses(pool, check), edits = createStoryboardEdits(pool, check);
    // Controlled prerequisites stand in for planning/upload producers; nothing here is an agent or builder.
    const source = await store.insert({ accountId: owner, conversationId: conversation, kind: 'script', content: script, createdBy: 'human', dependencies: [] });
    const ada = await store.insert({ accountId: owner, conversationId: conversation, kind: 'reference', content: reference('Ada'), createdBy: 'human', dependencies: [] });
    const guard = await store.insert({ accountId: owner, conversationId: conversation, kind: 'reference', content: reference('Guard'), createdBy: 'human', dependencies: [] });
    const foreign = await store.insert({ accountId: other, conversationId: foreignConversation, kind: 'reference', content: reference('Stranger'), createdBy: 'human', dependencies: [] });
    const plan = { schemaVersion: 1, sourceScriptVersionId: source.id, shots: [
      { shotId: 's1', order: 0, intent: 'Ada waits.', panels: [{ panelId: 'p1', order: 0, description: 'Ada beneath the clock.', references: [ada.id] }, { panelId: 'p2', order: 1, description: 'Her ticket.', references: [] }] },
      { shotId: 's2', order: 1, intent: 'A train arrives.', panels: [{ panelId: 'p3', order: 0, description: 'The train reaches the platform.', references: [] }] },
      { shotId: 's3', order: 2, intent: 'The guard waves.', panels: [{ panelId: 'p4', order: 0, description: 'A raised hand.', references: [guard.id] }] },
    ] };
    const board = await store.insert({ accountId: owner, conversationId: conversation, kind: 'storyboard', content: plan, createdBy: 'human', dependencies: [source.id, ada.id, guard.id], use: { binding: { purpose: 'storyboard' }, state: 'approved' } });
    const image = (name: string) => transaction(pool, client => publishVersion(client, { accountId: owner, conversationId: conversation, kind: 'image', createdBy: 'human', dependencies: [], media: { contentType: 'image/png', byteSize: 1024 + name.length, width: 64, height: 36 } }));
    const [first, second, train] = [await image('first'), await image('second'), await image('train')];
    // Upload completion records verified images as draft candidates for their exact Panel.
    for (const [version, shotId, panelId] of [[first, 's1', 'p1'], [second, 's1', 'p1'], [train, 's2', 'p3']] as const) {
      await pool.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'panel_image','draft')", [owner, conversation, randomUUID(), version.id, { purpose: 'panel_image', shotId, panelId }]);
    }
    const fingerprint = async () => (await query(db.servingUrl, `SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.commands) AS commands,(SELECT count(*)::int FROM artifacts.manual_changes) AS changes,
      (SELECT COALESCE(jsonb_agg(jsonb_build_array(use_id,version_id,state) ORDER BY use_id),'[]') FROM artifacts.conversation_uses) AS uses,(SELECT COALESCE(max(revision),0)::int FROM artifacts.selection_revisions) AS revision`)).rows[0];
    const panel = async (shotId: string, panelId: string) => (await store.workspace(owner, conversation)).storyboard.shots.find(shot => shot.shotId === shotId)?.panels.find(item => item.panelId === panelId);

    let workspace = await store.workspace(owner, conversation);
    assert.equal(workspace.selectionRevision, 0);
    assert.deepEqual((await panel('s1', 'p1'))?.candidateImageVersions.map(version => version.id), [first.id, second.id]);
    assert.equal((await panel('s1', 'p1'))?.approvedImageVersionId, null, 'Displayed candidates are not approved images');

    // Exact Panel-image use validates its target and kind; approving one returns the earlier choice to the candidates.
    const use = (versionId: string, shotId: string, panelId: string, account = owner, target = conversation) => uses.useVersion(account, target, { operationId: randomUUID(), versionId, purpose: 'panel_image', shotId, panelId });
    const beforeRejectedUse = await fingerprint();
    await assert.rejects(use(first.id, 's1', 'p3'), { code: 'invalid_input' }, 'A Panel of another Shot is a wrong target');
    await assert.rejects(use(first.id, 's9', 'p1'), { code: 'invalid_input' });
    await assert.rejects(use(source.id, 's1', 'p1'), { code: 'invalid_input' }, 'Only image versions bind to Panels');
    await assert.rejects(use(first.id, 's1', 'p1', owner, empty), { code: 'invalid_input' }, 'A conversation without planning has no Panel targets');
    await assert.rejects(use(first.id, 's1', 'p1', other, foreignConversation), { code: 'not_found' });
    assert.deepEqual(await fingerprint(), beforeRejectedUse);
    assert.equal((await use(first.id, 's1', 'p1')).use.state, 'approved');
    const chosen = await use(second.id, 's1', 'p1');
    assert.equal(chosen.selectionRevision, 0, 'Panel-image approval is not a Shot-order or Shot-video choice');
    assert.equal((await panel('s1', 'p1'))?.approvedImageVersionId, second.id);
    assert.deepEqual((await panel('s1', 'p1'))?.candidateImageVersions.map(version => version.id), [first.id, second.id], 'The earlier choice stays an exact candidate');
    await use(train.id, 's2', 'p3');

    // Viewing and reloading never mutate selection authority or consume change records.
    const beforeReads = await fingerprint();
    await store.workspace(owner, conversation); await store.version(owner, board.id); await store.history(owner, board.artifactId);
    assert.deepEqual(await fingerprint(), beforeReads);

    const shots = (order: readonly string[], change: (shotId: string, panelId: string) => { description?: string; references?: string[] } = () => ({})): Edit['shots'] =>
      order.map((shotId, index) => { const shot = plan.shots.find(item => item.shotId === shotId)!; return { shotId, order: index, panels: shot.panels.map(item => ({ panelId: item.panelId, order: item.order, references: item.references, ...change(shotId, item.panelId) })) }; });
    const edit = (body: Omit<Edit, 'operationId'> & { operationId?: string }) => edits.editStoryboard(owner, conversation, { operationId: randomUUID(), ...body });

    // Invalid, stale and foreign edits change nothing.
    const beforeRejectedEdits = await fingerprint();
    for (const invalid of [
      shots(['s1', 's2']),
      shots(['s1', 's2', 's3', 's1']),
      shots(['s1', 's2', 's3']).map(shot => shot.shotId === 's1' ? { ...shot, panels: shot.panels.slice(0, 1) } : shot),
      shots(['s1', 's2', 's3']).map(shot => shot.shotId === 's2' ? { ...shot, panels: [{ panelId: 'p9', order: 0, references: [] }] } : shot),
      shots(['s1', 's2', 's3']).map(shot => ({ ...shot, order: 0 })),
      shots(['s1', 's2', 's3'], (_shot, panelId) => panelId === 'p2' ? { references: [source.id] } : {}),
      shots(['s1', 's2', 's3']),
    ]) await assert.rejects(edit({ baseVersionId: board.id, shots: invalid }), { code: 'invalid_input' });
    await assert.rejects(edit({ baseVersionId: board.id, shots: shots(['s1', 's2', 's3'], (_shot, panelId) => panelId === 'p2' ? { references: [foreign.id] } : {}) }), { code: 'not_found' });
    await assert.rejects(edits.editStoryboard(other, conversation, { operationId: randomUUID(), baseVersionId: board.id, shots: shots(['s2', 's1', 's3']) }), { code: 'not_found' });
    await assert.rejects(edits.editStoryboard(owner, empty, { operationId: randomUUID(), baseVersionId: board.id, shots: shots(['s2', 's1', 's3']) }), { code: 'not_found' });
    assert.deepEqual(await fingerprint(), beforeRejectedEdits);

    // A description edit is not an order change; it names the exact downstream work of the changed Shot.
    const described: Edit = { operationId: randomUUID(), baseVersionId: board.id, shots: shots(['s1', 's2', 's3'], (_shot, panelId) => panelId === 'p2' ? { description: 'Her ticket, torn.', references: [guard.id] } : {}) };
    const textEdit = await edits.editStoryboard(owner, conversation, described);
    assert.equal(textEdit.selectionRevision, 0, 'Description-only edits do not masquerade as order changes');
    assert.deepEqual(textEdit.affected, [first.id, second.id].sort(), 'Every Panel-image of the changed Shot, siblings included, needs revalidation');
    assert.deepEqual(textEdit.version.dependencies, [source.id, ada.id, guard.id]);
    assert.ok('content' in textEdit.version);
    assert.deepEqual(textEdit.version.content, { ...plan, shots: plan.shots.map(shot => shot.shotId !== 's1' ? shot : { ...shot, panels: [shot.panels[0], { ...shot.panels[1]!, description: 'Her ticket, torn.', references: [guard.id] }] }) });
    assert.deepEqual(await edits.editStoryboard(owner, conversation, described), textEdit, 'Retries return the original result without a second version');
    await assert.rejects(edits.editStoryboard(owner, conversation, { ...described, shots: shots(['s2', 's1', 's3']) }), { code: 'invalid_input' }, 'An operation identity cannot carry another payload');
    workspace = await store.workspace(owner, conversation);
    assert.equal(workspace.storyboard.work?.version.id, textEdit.version.id);
    assert.equal((await panel('s1', 'p1'))?.approvedImageVersionId, second.id, 'Changes require revalidation; they never erase approvals');
    assert.equal((await panel('s2', 'p3'))?.approvedImageVersionId, train.id);
    await assert.rejects(edit({ baseVersionId: board.id, shots: shots(['s2', 's1', 's3']) }), { code: 'stale_revision' });

    // Reordering advances the revision once, atomically with its version, use and change record.
    const reorder: Edit = { operationId: randomUUID(), baseVersionId: textEdit.version.id, shots: shots(['s2', 's1', 's3'], (_shot, panelId) => panelId === 'p2' ? { description: 'Her ticket, torn.', references: [guard.id] } : {}) };
    const reordered = await edits.editStoryboard(owner, conversation, reorder);
    assert.equal(reordered.selectionRevision, 1); assert.deepEqual(reordered.affected, []);
    assert.deepEqual(await edits.editStoryboard(owner, conversation, reorder), reordered);
    workspace = await store.workspace(owner, conversation);
    assert.equal(workspace.selectionRevision, 1);
    assert.deepEqual(workspace.storyboard.shots.map(shot => [shot.shotId, shot.panels.map(item => item.panelId)]), [['s2', ['p3']], ['s1', ['p1', 'p2']], ['s3', ['p4']]]);

    // Concurrent reorders from one base: exactly one commits and the revision advances exactly once.
    const racing = await Promise.allSettled([['s3', 's2', 's1'], ['s1', 's3', 's2']].map(order => edit({ baseVersionId: reordered.version.id, shots: shots(order, (_shot, panelId) => panelId === 'p2' ? { description: 'Her ticket, torn.', references: [guard.id] } : {}) })));
    assert.equal(racing.filter(result => result.status === 'fulfilled').length, 1);
    assert.ok(racing.some(result => result.status === 'rejected' && (result.reason as { code?: string }).code === 'stale_revision'));
    assert.equal((await store.workspace(owner, conversation)).selectionRevision, 2);

    // Using an earlier plan with a different Shot order is itself an order change; the same order is not.
    const restored = await uses.useVersion(owner, conversation, { operationId: randomUUID(), versionId: textEdit.version.id, purpose: 'storyboard' });
    assert.equal(restored.selectionRevision, 3);
    const same = await uses.useVersion(owner, conversation, { operationId: randomUUID(), versionId: textEdit.version.id, purpose: 'storyboard' });
    assert.equal(same.selectionRevision, 3);

    const journal = (await query(db.servingUrl, "SELECT version_id,affected_version_ids,selection_revision::int AS revision FROM artifacts.manual_changes WHERE command_kind='edit_storyboard' ORDER BY created_at")).rows;
    assert.deepEqual(journal.map(row => [row.version_id, row.affected_version_ids, row.revision]).slice(0, 2), [[textEdit.version.id, [first.id, second.id].sort(), null], [reordered.version.id, [], 1]]);
    assert.equal(journal.length, 3);
    assert.equal((await query(db.servingUrl, "SELECT count(*)::int AS count FROM artifacts.commands WHERE command_kind='edit_storyboard'")).rows[0]?.count, 3);

    // Upstream manual saves journal the exact dependent plan and the Panel images of every Shot that cites them.
    const writers = createArtifactWriters(pool, check);
    const upstream = async (version: Version, content: OperationRequest<'saveVersion'>['body']['content']) => {
      const saved = await writers.human.save(owner, conversation, { operationId: randomUUID(), artifactId: version.artifactId, baseVersionId: version.id, kind: version.kind as 'script' | 'reference', content, dependencies: [] });
      return (await pool.query<{ affected_version_ids: string[] }>('SELECT affected_version_ids FROM artifacts.manual_changes WHERE version_id=$1', [saved.version.id])).rows[0]?.affected_version_ids;
    };
    assert.deepEqual(await upstream(ada, { ...reference('Ada'), subject: { ...reference('Ada').subject, description: 'Ada carrying a small case.' } }), [textEdit.version.id, first.id, second.id].sort());
    assert.deepEqual(await upstream(source, { ...script, scenes: [{ ...script.scenes[0]!, script: [{ action: 'Ada runs for the train.' }] }] }), [textEdit.version.id, first.id, second.id, train.id].sort(), 'A changed source Script has unknown impact on every Shot');
    assert.equal((await store.workspace(owner, conversation)).storyboard.work?.version.id, textEdit.version.id, 'Upstream saves never rewrite or repin planning');
    assert.equal((await panel('s1', 'p1'))?.approvedImageVersionId, second.id);

    // Restricted SQL cannot rewind, skip or erase selection authority.
    for (const sql of [
      'UPDATE artifacts.selection_revisions SET revision=revision+2',
      'UPDATE artifacts.selection_revisions SET revision=1',
      'DELETE FROM artifacts.selection_revisions',
    ]) await assert.rejects(query(db.servingUrl, sql), /./);
    assert.equal((await store.workspace(owner, conversation)).selectionRevision, 3);
    const history = await store.history(owner, board.artifactId);
    assert.deepEqual(history.items.map((version: Version) => version.revision), [4, 3, 2, 1], 'Every saved plan stays in history');
  } finally { await native.close(); if (!pool.ended) await pool.end(); await setup.close(); await db.close(); }
});
