import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';
import type { OperationRequest, Version } from '@workprint/contracts';
import { createArtifactStore, createArtifactWriters, createStoryboardEdits, createVersionUses } from '../../src/artifacts/index.js';
import { publishVersion } from '../../src/artifacts/publication.js';
import { createOwnedConversationCheck } from '../../src/agent/index.js';
import { transaction } from '../../src/db/index.js';
import { createNativeConversation } from '../support/native-conversations.js';
import { query } from '../support/postgres.js';
import { testStack } from '../support/test-stack.js';
import { applyArtifactMigrations } from '../support/artifact-database.js';

type Edit = OperationRequest<'editStoryboard'>['body'];
const script = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'Ada waits for the train.' }] }] };
const reference = (name: string) => ({ schemaVersion: 1, subject: { id: name.toLowerCase(), kind: 'character', name, description: `${name} in a green coat.`, continuityNotes: ['Keep the coat.'] }, references: [] });

test('storyboard edits keep stable Shot and Panel identities and one forward-only selection revision', { timeout: 120000 }, async t => {
  const db = await testStack().testDatabase(), pool = new Pool({ connectionString: db.servingUrl, max: 4, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
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
    await t.test('uploaded Panel images are candidates, not approvals', async () => {
      assert.equal(workspace.selectionRevision, 0);
      assert.deepEqual((await panel('s1', 'p1'))?.candidateImageVersions.map(version => version.id), [first.id, second.id]);
      assert.equal((await panel('s1', 'p1'))?.approvedImageVersionId, null, 'Displayed candidates are not approved images');
    });

    // Exact Panel-image use validates its target and kind; approving one returns the earlier choice to the candidates.
    const use = (versionId: string, shotId: string, panelId: string, account = owner, target = conversation) => uses.useVersion(account, target, { operationId: randomUUID(), versionId, purpose: 'panel_image', shotId, panelId });
    await t.test('Panel-image use validates its target and keeps earlier choices as candidates', async () => {
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
    });

    await t.test('viewing and reloading never change selection', async () => {
      // Viewing and reloading never mutate selection authority or consume change records.
      const beforeReads = await fingerprint();
      await store.workspace(owner, conversation); await store.version(owner, board.id); await store.history(owner, board.artifactId);
      assert.deepEqual(await fingerprint(), beforeReads);
    });

    const shots = (order: readonly string[], change: (shotId: string, panelId: string) => { description?: string; references?: string[] } = () => ({})): Edit['shots'] =>
      order.map((shotId, index) => { const shot = plan.shots.find(item => item.shotId === shotId)!; return { shotId, order: index, panels: shot.panels.map(item => ({ panelId: item.panelId, order: item.order, references: item.references, ...change(shotId, item.panelId) })) }; });
    const edit = (body: Omit<Edit, 'operationId'> & { operationId?: string }) => edits.editStoryboard(owner, conversation, { operationId: randomUUID(), ...body });
    let textEdit!: Awaited<ReturnType<typeof edits.editStoryboard>>, reordered!: Awaited<ReturnType<typeof edits.editStoryboard>>;

    await t.test('invalid, stale and foreign edits change nothing', async () => {
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
    });

    await t.test('a description edit records affected work without advancing the revision', async () => {
      // A description edit is not an order change; it names the exact downstream work of the changed Shot.
      const described: Edit = { operationId: randomUUID(), baseVersionId: board.id, shots: shots(['s1', 's2', 's3'], (_shot, panelId) => panelId === 'p2' ? { description: 'Her ticket, torn.', references: [guard.id] } : {}) };
      textEdit = await edits.editStoryboard(owner, conversation, described);
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
    });

    await t.test('a reorder advances the revision exactly once', async () => {
      // Reordering advances the revision once, atomically with its version, use and change record.
      const reorder: Edit = { operationId: randomUUID(), baseVersionId: textEdit.version.id, shots: shots(['s2', 's1', 's3'], (_shot, panelId) => panelId === 'p2' ? { description: 'Her ticket, torn.', references: [guard.id] } : {}) };
      reordered = await edits.editStoryboard(owner, conversation, reorder);
      assert.equal(reordered.selectionRevision, 1); assert.deepEqual(reordered.affected, []);
      assert.deepEqual(await edits.editStoryboard(owner, conversation, reorder), reordered);
      workspace = await store.workspace(owner, conversation);
      assert.equal(workspace.selectionRevision, 1);
      assert.deepEqual(workspace.storyboard.shots.map(shot => [shot.shotId, shot.panels.map(item => item.panelId)]), [['s2', ['p3']], ['s1', ['p1', 'p2']], ['s3', ['p4']]]);
    });

    await t.test('concurrent reorders from one base commit once', async () => {
      // Concurrent reorders from one base: exactly one commits and the revision advances exactly once.
      const racing = await Promise.allSettled([['s3', 's2', 's1'], ['s1', 's3', 's2']].map(order => edit({ baseVersionId: reordered.version.id, shots: shots(order, (_shot, panelId) => panelId === 'p2' ? { description: 'Her ticket, torn.', references: [guard.id] } : {}) })));
      assert.equal(racing.filter(result => result.status === 'fulfilled').length, 1);
      assert.ok(racing.some(result => result.status === 'rejected' && (result.reason as { code?: string }).code === 'stale_revision'));
      assert.equal((await store.workspace(owner, conversation)).selectionRevision, 2);
    });

    const winner = (await store.workspace(owner, conversation)).storyboard.work!.version, failing = randomUUID();
    await t.test('a failure after the revision advance rolls the edit back', async () => {
      // A failure after the revision advance rolls back every effect of the edit.
      await query(db.setupUrl, `CREATE FUNCTION artifacts.injected_change_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected journal failure'; END; $$;
        CREATE TRIGGER injected_change_failure BEFORE INSERT ON artifacts.manual_changes FOR EACH ROW WHEN (NEW.operation_id = '${failing}') EXECUTE FUNCTION artifacts.injected_change_failure()`);
      const beforeFailure = await fingerprint();
      await assert.rejects(edits.editStoryboard(owner, conversation, { operationId: failing, baseVersionId: winner.id, shots: shots(['s2', 's3', 's1'], (_shot, panelId) => panelId === 'p2' ? { description: 'Her ticket, torn.', references: [guard.id] } : {}) }), /injected journal failure/);
      assert.deepEqual(await fingerprint(), beforeFailure, 'No version, use, revision, command or journal survives a failed transaction');
    });

    await t.test('restoring an earlier plan is an order change and reusing the same plan is not', async () => {
      // Using an earlier plan with a different Shot order is itself an order change, journalled with its affected work; the same version is not.
      const restored = await uses.useVersion(owner, conversation, { operationId: randomUUID(), versionId: board.id, purpose: 'storyboard' });
      assert.equal(restored.selectionRevision, 3);
      const same = await uses.useVersion(owner, conversation, { operationId: randomUUID(), versionId: board.id, purpose: 'storyboard' });
      assert.equal(same.selectionRevision, 3);
      const decisions = (await query(db.servingUrl, `SELECT operation_id,previous_version_id,version_id,affected_version_ids,selection_revision::int AS revision FROM artifacts.use_changes c
        JOIN artifacts.commands USING (owner_id,conversation_id,command_kind,operation_id) WHERE c.version_id='${board.id}' ORDER BY c.created_at`)).rows;
      assert.deepEqual(decisions.map(row => [row.previous_version_id, row.version_id, row.affected_version_ids, row.revision]), [[winner.id, board.id, [first.id, second.id].sort(), 3], [board.id, board.id, [], null]]);
      assert.equal((await query(db.servingUrl, "SELECT count(*)::int AS count FROM artifacts.use_changes WHERE previous_version_id IS NOT NULL AND version_id IN (SELECT version_id FROM artifacts.versions WHERE kind='image')")).rows[0]?.count, 1, 'Approving another Panel image journals the approval it replaced');

      const journal = (await query(db.servingUrl, "SELECT version_id,affected_version_ids,selection_revision::int AS revision FROM artifacts.manual_changes WHERE command_kind='edit_storyboard' ORDER BY created_at")).rows;
      assert.deepEqual(journal.map(row => [row.version_id, row.affected_version_ids, row.revision]), [[textEdit.version.id, [first.id, second.id].sort(), null], [reordered.version.id, [], 1], [winner.id, [], 2]]);
      assert.equal((await query(db.servingUrl, "SELECT count(*)::int AS count FROM artifacts.commands WHERE command_kind='edit_storyboard'")).rows[0]?.count, 3);
    });

    await t.test('upstream saves record the dependent plan and Panel images', async () => {
      // Upstream manual saves journal the exact dependent plan and the Panel images of every Shot that cites them.
      const writers = createArtifactWriters(pool, check);
      const upstream = async (version: Version, content: OperationRequest<'saveVersion'>['body']['content']) => {
        const saved = await writers.human.save(owner, conversation, { operationId: randomUUID(), artifactId: version.artifactId, baseVersionId: version.id, kind: version.kind as 'script' | 'reference', content, dependencies: [] });
        return (await pool.query<{ affected_version_ids: string[] }>('SELECT affected_version_ids FROM artifacts.manual_changes WHERE version_id=$1', [saved.version.id])).rows[0]?.affected_version_ids;
      };
      assert.deepEqual(await upstream(ada, { ...reference('Ada'), subject: { ...reference('Ada').subject, description: 'Ada carrying a small case.' } }), [board.id, first.id, second.id].sort());
      assert.deepEqual(await upstream(source, { ...script, scenes: [{ ...script.scenes[0]!, script: [{ action: 'Ada runs for the train.' }] }] }), [board.id, first.id, second.id, train.id].sort(), 'A changed source Script has unknown impact on every Shot');
      assert.equal((await store.workspace(owner, conversation)).storyboard.work?.version.id, board.id, 'Upstream saves never rewrite or repin planning');
      assert.equal((await panel('s1', 'p1'))?.approvedImageVersionId, second.id);
    });

    await t.test('SQL cannot rewind or erase revisions and every plan stays in history', async () => {
      // Restricted SQL cannot rewind, skip or erase selection authority.
      for (const sql of [
        'UPDATE artifacts.selection_revisions SET revision=revision+2',
        'UPDATE artifacts.selection_revisions SET revision=1',
      ]) await assert.rejects(query(db.servingUrl, sql), /Selection revisions only advance/);
      await assert.rejects(query(db.servingUrl, `INSERT INTO artifacts.selection_revisions(owner_id,conversation_id,revision) VALUES('${owner}','${empty}',5)`), /Selection revisions only advance/, 'A first revision cannot skip ahead');
      await assert.rejects(query(db.servingUrl, 'DELETE FROM artifacts.selection_revisions'), /permission denied/);
      assert.equal((await store.workspace(owner, conversation)).selectionRevision, 3);
      const history = await store.history(owner, board.artifactId);
      assert.deepEqual(history.items.map((version: Version) => version.revision), [4, 3, 2, 1], 'Every saved plan stays in history');
    });

    await t.test('a person\'s edit of an assistant storyboard keeps its Shot fields and its sheets', async () => {
      // The assistant's Shot fields and subject sheets are not part of the person's edit body; an edit must not drop them.
      // The script lists a place the Shot doesn't name: the agent's place rule never refuses a person's edit.
      const video = (await createNativeConversation(setup, owner)).id;
      const scene = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'Ada waits.' }] }], subjects: [{ id: 'ada', kind: 'character', name: 'Ada' }, { id: 'station', kind: 'place', name: 'Station' }] };
      const told = await store.insert({ accountId: owner, conversationId: video, kind: 'script', content: scene, createdBy: 'human', dependencies: [], use: { binding: { purpose: 'script' }, state: 'approved' } });
      const sheet = await store.insert({ accountId: owner, conversationId: video, kind: 'reference', content: reference('Ada'), createdBy: 'assistant', dependencies: [], use: { binding: { purpose: 'reference' }, state: 'draft' } });
      const fields = { framing: 'close-up', action: 'Ada checks the clock.', cameraNote: 'Hold.', dialogue: [{ character: 'Ada', text: 'Late again.' }], references: [{ subjectId: 'ada', role: 'identity' as const, purpose: 'Her face.' }],
        positions: { start: 'Ada under the clock, frame right.', end: 'Ada looks frame left.' } };
      const planned = await store.insert({ accountId: owner, conversationId: video, kind: 'storyboard', createdBy: 'assistant', dependencies: [told.id, sheet.id], use: { binding: { purpose: 'storyboard' }, state: 'draft' },
        content: { schemaVersion: 1, sourceScriptVersionId: told.id, shots: [{ shotId: 'a1', order: 0, intent: 'Ada waits.', ...fields, panels: [{ panelId: 'a1-p1', order: 0, description: 'Ada under the clock.', references: [sheet.id] }] }] } });
      const edited = await edits.editStoryboard(owner, video, { operationId: randomUUID(), baseVersionId: planned.id, shots: [{ shotId: 'a1', order: 0, intent: 'Ada waits, worried.', panels: [{ panelId: 'a1-p1', order: 0, references: [] }] }] });
      assert.ok('content' in edited.version);
      const [shot] = (edited.version.content as { shots: Record<string, unknown>[] }).shots;
      assert.deepEqual({ ...shot, panels: undefined }, { shotId: 'a1', order: 0, intent: 'Ada waits, worried.', ...fields, panels: undefined });
      assert.deepEqual(edited.version.dependencies, [told.id, sheet.id], 'the sheet stays a dependency after its panel reference is dropped, since the Shot still names Ada');
      // A person's next version of Ada's sheet reaches the panel images of every Shot that names Ada.
      const drawn = await transaction(pool, client => publishVersion(client, { accountId: owner, conversationId: video, kind: 'image', createdBy: 'human', dependencies: [], media: { contentType: 'image/png', byteSize: 4096, width: 64, height: 36 } }));
      await use(drawn.id, 'a1', 'a1-p1', owner, video);
      const redrawn = await createArtifactWriters(pool, check).human.save(owner, video, { operationId: randomUUID(), artifactId: sheet.artifactId, baseVersionId: sheet.id, kind: 'reference', content: { ...reference('Ada'), subject: { ...reference('Ada').subject, description: 'Ada in a red coat.' } }, dependencies: [] });
      const affected = (await pool.query<{ affected_version_ids: string[] }>('SELECT affected_version_ids FROM artifacts.manual_changes WHERE version_id=$1', [redrawn.version.id])).rows[0]?.affected_version_ids;
      assert.deepEqual(affected, [edited.version.id, drawn.id].sort());
    });

    await t.test('a person\'s length edit changes only that Shot\'s length; an out-of-range length saves nothing', async () => {
      const video = (await createNativeConversation(setup, owner)).id;
      const scene = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'Ada waits.' }] }], subjects: [{ id: 'ada', kind: 'character', name: 'Ada' }] };
      const told = await store.insert({ accountId: owner, conversationId: video, kind: 'script', content: scene, createdBy: 'human', dependencies: [], use: { binding: { purpose: 'script' }, state: 'approved' } });
      const fields = { framing: 'wide', action: 'Ada checks the clock.', cameraNote: 'Hold.', dialogue: [{ character: 'Ada', text: 'Late again.' }] };
      const shotsOf = (durations: [number, number]) => [
        { shotId: 'b1', order: 0, intent: 'Ada waits.', ...fields, durationS: durations[0], panels: [{ panelId: 'b1-p1', order: 0, description: 'Ada under the clock.', references: [] }] },
        { shotId: 'b2', order: 1, intent: 'The train comes.', durationS: durations[1], panels: [{ panelId: 'b2-p1', order: 0, description: 'The train.', references: [] }] },
      ];
      const planned = await store.insert({ accountId: owner, conversationId: video, kind: 'storyboard', createdBy: 'assistant', dependencies: [told.id], use: { binding: { purpose: 'storyboard' }, state: 'draft' },
        content: { schemaVersion: 1, sourceScriptVersionId: told.id, shots: shotsOf([6, 5]) } });
      const body = (durationS: number) => [
        { shotId: 'b1', order: 0, intent: 'Ada waits.', durationS, panels: [{ panelId: 'b1-p1', order: 0, references: [] }] },
        { shotId: 'b2', order: 1, intent: 'The train comes.', panels: [{ panelId: 'b2-p1', order: 0, references: [] }] },
      ];
      const lengthened = await edits.editStoryboard(owner, video, { operationId: randomUUID(), baseVersionId: planned.id, shots: body(8) });
      assert.ok('content' in lengthened.version);
      assert.deepEqual((lengthened.version.content as { shots: unknown[] }).shots, shotsOf([8, 5]), 'only Shot b1\'s length changed; its action, dialogue and the other Shot are kept');
      const before = await store.workspace(owner, video);
      for (const durationS of [16, 3, 6.5]) await assert.rejects(edits.editStoryboard(owner, video, { operationId: randomUUID(), baseVersionId: lengthened.version.id, shots: body(durationS) }), { code: 'invalid_input' }, String(durationS));
      assert.equal((await store.workspace(owner, video)).storyboard.work?.version.id, before.storyboard.work?.version.id, 'a refused length saves no version');

      // Positions are edited the same way: added to Shot b1, which had none, changing nothing else; an empty one saves nothing.
      const positions = { start: 'Ada under the clock, frame right.', end: 'Ada turns to the platform, frame left.' };
      const moved = await edits.editStoryboard(owner, video, { operationId: randomUUID(), baseVersionId: lengthened.version.id, shots: body(8).map(shot => shot.shotId === 'b1' ? { ...shot, positions } : shot) });
      assert.ok('content' in moved.version);
      const [b1, b2] = shotsOf([8, 5]);
      assert.deepEqual((moved.version.content as { shots: unknown[] }).shots, [{ ...b1, positions }, b2]);
      await assert.rejects(edits.editStoryboard(owner, video, { operationId: randomUUID(), baseVersionId: moved.version.id, shots: body(8).map(shot => shot.shotId === 'b1' ? { ...shot, positions: { start: ' ', end: 'x' } } : shot) }), { code: 'invalid_input' });
      assert.equal((await store.workspace(owner, video)).storyboard.work?.version.id, moved.version.id, 'a refused positions edit saves no version');
    });
  } finally { await native.close(); if (!pool.ended) await pool.end(); await setup.close(); await db.close(); }
});
