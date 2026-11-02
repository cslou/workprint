import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';
import type { OperationRequest, Version } from '@workprint/contracts';
import { createOwnedConversationCheck } from '../../src/agent/index.js';
import { BUILT_IN_OWNER } from '../../src/artifacts/store.js';
import { createArtifactStore, createArtifactWriters, createAssistantReferences, createAssistantScripts, createAssistantStoryboards, createGeneratedImages, createMediaVerifier } from '../../src/artifacts/index.js';
import { publishVersion } from '../../src/artifacts/publication.js';
import { createAssistantScriptSaver, createAssistantSheets, createAssistantStoryboardSaver, createWorkspaceReader, type AssistantSheetOutcome, type AssistantStoryboardOutcome, createGeneratedImageSaver, createImageInputReader } from '../../src/application/index.js';
import { transaction } from '../../src/db/index.js';
import { createMediaSandbox, createPrivateObjectStorage } from '../../src/storage/index.js';
import { testPng } from '../support/meta-image-fake.js';
import { createNativeConversation } from '../support/native-conversations.js';
import { query } from '../support/postgres.js';
import { testStack, type TestDatabase } from '../support/test-stack.js';
import { applyArtifactMigrations } from '../support/artifact-database.js';

type Command = OperationRequest<'saveVersion'>['body'];
const script = (action: string) => ({ schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action }] }] });

test('human reference save moves only the exact role/conversation use and journals its identity', { timeout: 120000 }, async () => {
  const db = await testStack().testDatabase();
  const pool = new Pool({ connectionString: db.servingUrl, max: 4, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  const native = new PostgresStore({ id: 'distinct-reference-bindings', connectionString: db.setupUrl, schemaName: 'mastra' });
  const serving = new PostgresStore({ id: 'distinct-reference-serving', schemaName: 'mastra', disableInit: true, pool });
  try {
    await native.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
    const account = 'distinct-binding-owner', firstConversation = await createNativeConversation(native, account), secondConversation = await createNativeConversation(native, account);
    const check = createOwnedConversationCheck(serving), store = createArtifactStore(pool, check), writer = createArtifactWriters(pool, check).human;
    const content = { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada reference', description: 'A traveller.', continuityNotes: ['Keep the green coat.'] }, references: [] };
    const first = await store.insert({ accountId: account, conversationId: firstConversation.id, kind: 'reference', createdBy: 'human', content, dependencies: [], use: { binding: { purpose: 'reference', role: 'lead' }, state: 'draft' } });
    await store.insert({ accountId: account, conversationId: firstConversation.id, artifactId: first.artifactId, kind: 'reference', createdBy: 'human', content, dependencies: [], use: { binding: { purpose: 'reference', role: 'support' }, state: 'approved' } });
    const base = await store.insert({ accountId: account, conversationId: secondConversation.id, artifactId: first.artifactId, kind: 'reference', createdBy: 'human', content, dependencies: [], use: { binding: { purpose: 'reference', role: 'lead' }, state: 'approved' } });
    await store.insert({ accountId: account, conversationId: firstConversation.id, kind: 'reference', createdBy: 'human', content, dependencies: [], use: { binding: { purpose: 'reference', role: 'lead' }, state: 'approved' } });
    type UseRow = { owner_id: string; conversation_id: string; use_id: string; version_id: string; binding: { purpose: 'reference'; role: string }; purpose: string; state: string; created_at: string };
    const uses = async () => (await pool.query<UseRow>('SELECT owner_id,conversation_id,use_id,version_id,binding,purpose,state,created_at::text FROM artifacts.conversation_uses ORDER BY use_id')).rows;
    const before = await uses();
    assert.equal(before.length, 4);
    const intended = before.find(row => row.conversation_id === firstConversation.id && row.version_id === first.id && row.binding.role === 'lead');
    assert.ok(intended); assert.equal(intended.state, 'draft');
    const operationId = randomUUID(), binding = { purpose: 'reference' as const, role: 'lead' };
    const command: Command = { operationId, artifactId: first.artifactId, baseVersionId: base.id, kind: 'reference', content: { ...content, subject: { ...content.subject, description: 'A traveller carrying a small case.' } }, dependencies: [], intendedUse: binding };
    const saved = await writer.save(account, firstConversation.id, command);
    assert.deepEqual(saved.use, { id: intended.use_id, versionId: saved.version.id, binding, state: 'approved' });
    const after = await uses();
    assert.deepEqual(after, before.map(row => row.use_id === intended.use_id ? { ...row, version_id: saved.version.id, state: 'approved' } : row), 'Every other role, conversation and artifact use remains byte-for-byte unchanged');
    assert.deepEqual((await pool.query('SELECT owner_id,conversation_id,operation_id,command_kind,previous_version_id,previous_use_version_id,version_id,use_id FROM artifacts.manual_changes')).rows, [{
      owner_id: account, conversation_id: firstConversation.id, operation_id: operationId, command_kind: 'manual_save', previous_version_id: base.id, previous_use_version_id: first.id, version_id: saved.version.id, use_id: intended.use_id,
    }], 'The journal links the exact moved use, edited base and prior pinned version');
    assert.deepEqual(await writer.save(account, firstConversation.id, command), saved);
    assert.deepEqual(await uses(), after);
    for (const [conversation, role] of [[firstConversation.id, 'missing'], [secondConversation.id, 'support']]) {
      await assert.rejects(writer.save(account, conversation!, { ...command, operationId: randomUUID(), baseVersionId: saved.version.id, intendedUse: { purpose: 'reference', role: role! } }), { code: 'not_found' }, 'A different/missing scoped role must not fall back to an existing use');
    }
    assert.deepEqual(await uses(), after);
    assert.deepEqual((await pool.query('SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.commands) AS commands,(SELECT count(*)::int FROM artifacts.manual_changes) AS changes')).rows, [{ versions: 5, commands: 1, changes: 1 }], 'Retry and negative controls create no extra effects');
  } finally { await native.close(); await serving.close(); if (!pool.ended) await pool.end(); await db.close(); }
});

describe('manual save writers', { timeout: 120000 }, () => {
  let db: TestDatabase, pool: Pool, native: PostgresStore;
  let store: ReturnType<typeof createArtifactStore>, writers: ReturnType<typeof createArtifactWriters>;
  let a: { id: string }, empty: { id: string }, b: { id: string }, first: Version, base: Version, foreign: Version, command: Command, draftCommand: Omit<Command, 'intendedUse'>;
  let fingerprint: () => Promise<unknown[]>, initial: unknown[], saved: Awaited<ReturnType<ReturnType<typeof createArtifactWriters>['human']['save']>>, detached: typeof saved, referenceSaved: typeof saved;
  before(async () => {
    db = await testStack().testDatabase();
    pool = new Pool({ connectionString: db.servingUrl, max: 4, connectionTimeoutMillis: 1000, statement_timeout: 2000, application_name: 'artifact-command-qualification' });
    native = new PostgresStore({ id: 'artifact-writers-setup', connectionString: db.setupUrl, schemaName: 'mastra' });
    await native.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
    a = await createNativeConversation(native, 'writer-a');
    empty = await createNativeConversation(native, 'writer-a');
    b = await createNativeConversation(native, 'writer-b');
    const nativeCheck = createOwnedConversationCheck(native);
    const check: typeof nativeCheck = async (account, conversation) => {
      const active = (await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='artifact-command-qualification' AND state LIKE 'idle in transaction%'")).rows[0]!.count;
      assert.equal(active, 0, 'Native authorization must run before acquiring a SQL transaction');
      return nativeCheck(account, conversation);
    };
    store = createArtifactStore(pool, check);
    writers = createArtifactWriters(pool, check);
    first = await store.insert({ accountId: 'writer-a', conversationId: a.id, kind: 'script', createdBy: 'human', content: script('Ada waits.'), dependencies: [], use: { binding: { purpose: 'script' }, state: 'approved' } });
    base = await store.insert({ accountId: 'writer-a', conversationId: a.id, artifactId: first.artifactId, kind: 'script', createdBy: 'assistant', content: script('Ada looks toward the platform.'), dependencies: [first.id] });
    foreign = await store.insert({ accountId: 'writer-b', conversationId: b.id, kind: 'script', createdBy: 'human', content: script('A different traveller waits.'), dependencies: [] });
    command = { operationId: randomUUID(), artifactId: base.artifactId, baseVersionId: base.id, kind: 'script', content: script('Ada checks her watch.'), dependencies: [first.id], intendedUse: { purpose: 'script' } };
    fingerprint = async () => (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='artifacts' ORDER BY tablename")).rows.reduce(async (previous: Promise<unknown[]>, row: { tablename: string }) => [...await previous, [row.tablename, (await pool.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS digest FROM artifacts."${row.tablename}" t`)).rows]], Promise.resolve([]));
    initial = await fingerprint();
  });
  after(async () => { await native?.close(); if (pool && !pool.ended) await pool.end(); await db?.close(); });

  test('invalid, foreign and impersonated saves change nothing', async () => {
  const impersonated = { ...command, createdBy: 'human' };
  for (const attempt of [
    () => writers.assistant.save('writer-a', a.id, command),
    () => writers.assistant.save('writer-a', a.id, impersonated),
    () => writers.human.save('writer-a', a.id, { ...command, dependencies: [] }),
    () => writers.human.save('writer-a', a.id, { ...command, content: { ...script('Ada checks her watch.'), scenes: [] } }),
  ]) await assert.rejects(attempt, { code: 'invalid_input' });
  for (const dependencies of [[foreign.id], ['unknown']]) await assert.rejects(writers.human.save('writer-a', a.id, { ...command, dependencies }), { code: 'not_found', message: 'Saved work not found' });
  await assert.rejects(writers.human.save('writer-a', b.id, command), { code: 'not_found' });
  assert.deepEqual(await fingerprint(), initial);

  });

  test('a failure in any write table rolls the whole save back', async () => {
  await query(db.setupUrl, "CREATE FUNCTION artifacts.fixture_write_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Owned rollback control'; END $$");
  for (const table of ['versions', 'version_dependencies', 'conversation_uses', 'commands', 'manual_changes']) {
    await query(db.setupUrl, `CREATE TRIGGER fixture_write_failure AFTER INSERT OR UPDATE ON artifacts.${table} FOR EACH ROW EXECUTE FUNCTION artifacts.fixture_write_failure()`);
    try {
      await assert.rejects(writers.human.save('writer-a', a.id, command), /Owned rollback control/, `Rollback after ${table}`);
      assert.deepEqual(await fingerprint(), initial, `No partial command, publication, version, dependency, use or change after ${table}`);
    } finally { await query(db.setupUrl, `DROP TRIGGER fixture_write_failure ON artifacts.${table}`); }
  }
  await query(db.setupUrl, 'DROP FUNCTION artifacts.fixture_write_failure()');
  });

  test('a replayed save returns its original result and a changed payload is rejected', async () => {
  saved = await writers.human.save('writer-a', a.id, command);
  assert.equal(saved.version.revision, 3); assert.equal(saved.use?.state, 'approved');
  const after = await fingerprint();
  assert.deepEqual(await writers.human.save('writer-a', a.id, command), saved);
  await assert.rejects(writers.human.save('writer-a', a.id, { ...command, content: script('A different payload with the same identity.') }), { code: 'invalid_input' });
  assert.deepEqual(await fingerprint(), after);
  });

  test('an assistant draft never moves the approved use', async () => {
  const { intendedUse, ...withoutUse } = command; draftCommand = withoutUse;
  assert.deepEqual(intendedUse, { purpose: 'script' });
  const draft = await writers.assistant.save('writer-a', a.id, { ...draftCommand, operationId: randomUUID(), baseVersionId: saved.version.id });
  assert.equal(draft.version.createdBy, 'assistant'); assert.equal(draft.use, undefined);
  assert.equal((await store.workspace('writer-a', a.id)).script?.version.id, saved.version.id, 'Assistant draft cannot move the pinned approved human use');
  detached = await writers.human.save('writer-a', empty.id, { ...draftCommand, baseVersionId: draft.version.id });
  assert.equal(detached.use, undefined, 'Owner/conversation command context permits a distinct save, without inventing a use');
  assert.equal((await store.workspace('writer-a', empty.id)).script, null);
  assert.deepEqual(await writers.human.save('writer-a', a.id, command), saved, 'Old retries return their original result without reapplying decisions');
  assert.equal((await store.workspace('writer-a', a.id)).script?.version.id, saved.version.id);
  const changes = (await pool.query('SELECT count(*)::int AS changes,count(use_id)::int AS decisions FROM artifacts.manual_changes')).rows;
  assert.deepEqual(changes, [{ changes: 2, decisions: 1 }], 'Assistant writes create neither manual changes nor human decisions');
  });

  test('a reference save with an ambiguous binding is rejected', async () => {
  const reference = await store.insert({ accountId: 'writer-a', conversationId: a.id, kind: 'reference', createdBy: 'human', dependencies: [], content: { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada reference', description: 'A traveller in a green coat.', continuityNotes: ['Keep the coat.'] }, references: [] }, use: { binding: { purpose: 'reference', role: 'ada' }, state: 'draft' } });
  assert.ok('content' in reference);
  const referenceContent = { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada reference', description: 'A traveller carrying a small case.', continuityNotes: ['Keep the coat.'] }, references: [] };
  referenceSaved = await writers.human.save('writer-a', a.id, { operationId: randomUUID(), artifactId: reference.artifactId, baseVersionId: reference.id, kind: 'reference', content: referenceContent, dependencies: [], intendedUse: { purpose: 'reference', role: 'ada' } });
  assert.equal(referenceSaved.use?.state, 'approved');
  assert.ok('content' in referenceSaved.version); assert.deepEqual(referenceSaved.version.content, referenceContent);
  const ambiguous = await store.insert({ accountId: 'writer-a', conversationId: a.id, kind: 'reference', createdBy: 'human', dependencies: [], content: referenceContent, use: { binding: { purpose: 'reference', role: 'ambiguous' }, state: 'draft' } });
  const ambiguousLatest = await store.insert({ accountId: 'writer-a', conversationId: a.id, artifactId: ambiguous.artifactId, kind: 'reference', createdBy: 'human', dependencies: [], content: referenceContent, use: { binding: { purpose: 'reference', role: 'ambiguous' }, state: 'draft' } });
  const beforeAmbiguous = await fingerprint();
  await assert.rejects(writers.human.save('writer-a', a.id, { operationId: randomUUID(), artifactId: ambiguous.artifactId, baseVersionId: ambiguousLatest.id, kind: 'reference', content: referenceContent, dependencies: [], intendedUse: { purpose: 'reference', role: 'ambiguous' } }), { code: 'invalid_input' }, 'An ambiguous binding must not move an arbitrary exact reference use');
  assert.deepEqual(await fingerprint(), beforeAmbiguous, 'Ambiguity changes no version, use, publication, journal or command');
  });

  test('a planning save cannot reorder, repoint or promote a reordered draft', async () => {
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
  });

  test('reads never consume changes and journals are immutable', async () => {
  const beforeReads = await fingerprint();
  await store.workspace('writer-a', a.id); await store.history('writer-a', base.artifactId); await store.version('writer-a', detached.version.id); await store.library('writer-a');
  assert.deepEqual(await fingerprint(), beforeReads, 'Reading workspace/history never consumes pending manual changes');
  for (const sql of ['UPDATE artifacts.commands SET result=result', 'DELETE FROM artifacts.manual_changes', "UPDATE artifacts.conversation_uses SET binding='{}'"]) await assert.rejects(query(db.servingUrl, sql));
  });
});

// The assistant's sheet saves, called directly with images saved as generate-image saves them.
test('the assistant saves a script subject\'s sheet as a draft, never over newer work, and never one image in two sheets', { timeout: 120000 }, async t => {
  const db = await testStack().testDatabase();
  const { storage: service, media } = testStack();
  const sandbox = await createMediaSandbox(media.toolchain);
  const native = new PostgresStore({ id: 'assistant-sheets', connectionString: db.setupUrl, schemaName: 'mastra' });
  const pool = new Pool({ connectionString: db.servingUrl, max: 4 }), sealer = new Pool({ connectionString: db.setupUrl, max: 1 });
  t.after(async () => { await pool.end(); await sealer.end(); await native.close(); await sandbox.close(); await db.close(); });
  await native.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
  const check = createOwnedConversationCheck(native), store = createArtifactStore(pool, check);
  const images = createGeneratedImages(pool, check, { storage: createPrivateObjectStorage(service), verifyMedia: createMediaVerifier(sandbox) });
  const saveImage = createGeneratedImageSaver(images.save), readInputs = createImageInputReader(store, images.read);
  const references = createAssistantReferences(pool, check), sheets = createAssistantSheets(references);
  const saveScript = createAssistantScriptSaver(createAssistantScripts(pool, check).save);
  const account = 'sheet-owner', other = 'sheet-other';
  const conversation = async (owner: string) => (await createNativeConversation(native, owner)).id;
  const video = await conversation(account), elsewhere = await conversation(account), unscripted = await conversation(account);
  const foreignVideo = await conversation(other);
  let seed = 0;
  const saved = (outcome: AssistantSheetOutcome) => { assert.equal(outcome.kind, 'saved', JSON.stringify(outcome)); return outcome as Extract<AssistantSheetOutcome, { kind: 'saved' }>; };
  const image = async (owner: string, conversation: string, extra: { inputs?: string[]; revises?: string } = {}) => {
    const saved = await saveImage(owner, conversation, { bytes: testPng({ seed: ++seed }), contentType: 'image/png', inputs: extra.inputs ?? [], ...(extra.revises ? { revises: extra.revises } : {}) });
    assert.equal(saved.kind, 'saved'); return (saved as { versionId: string }).versionId;
  };
  const scene = (characters: string[]) => ({ schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters, script: [{ action: 'Mara waits.' }] }] });
  const subjects = (mara: string) => [{ id: '', kind: 'character' as const, name: mara }, { id: '', kind: 'place' as const, name: 'The Gallery' }];
  const first = await saveScript(account, video, { baseVersionId: null, content: scene([]), subjects: subjects('Mara') });
  assert.equal(first.kind, 'saved');
  const views = (ids: string[]) => ids.map((versionId, index) => ({ versionId, view: ['Full-body front', 'Three-quarter', 'Face close-up', 'Hands', 'Back', 'Side'][index]!, notes: [] }));
  const mara = (ids: string[], baseVersionId: string | null) => ({ subjectId: 'mara', description: 'A courier in a long grey coat.', continuityNotes: ['Keep the grey coat.'], views: views(ids), baseVersionId });
  const versionRow = async (id: string) => (await pool.query<{ revision: number; created_by: string; artifact_id: string; content: { subject: unknown; references: { versionId: string; view: string }[] } }>('SELECT revision,created_by,artifact_id,content FROM artifacts.versions WHERE version_id=$1', [id])).rows[0]!;
  const sheetUse = async (versionId: string) => (await pool.query<{ use_id: string; state: string; purpose: string }>('SELECT use_id,state,purpose FROM artifacts.conversation_uses WHERE version_id=$1', [versionId])).rows;
  const references_ = async (conversation: string) => Number((await pool.query<{ count: string }>("SELECT count(*) FROM artifacts.versions WHERE origin_conversation_id=$1 AND kind='reference'", [conversation])).rows[0]!.count);
  const [i1, i2, i3, i4] = [await image(account, video), await image(account, video), await image(account, video), await image(account, video)];

  const v1 = saved(await sheets.save(account, video, mara([i1, i2, i3], null)));
  assert.deepEqual([v1.revision, v1.subjectName], [1, 'Mara']);
  const row1 = await versionRow(v1.versionId);
  assert.equal(row1.created_by, 'assistant');
  assert.deepEqual(row1.content.subject, { id: 'mara', kind: 'character', name: 'Mara', description: 'A courier in a long grey coat.', continuityNotes: ['Keep the grey coat.'] });
  assert.deepEqual(row1.content.references.map(reference => [reference.versionId, reference.view]), [[i1, 'Full-body front'], [i2, 'Three-quarter'], [i3, 'Face close-up']]);
  assert.deepEqual((await store.version(account, v1.versionId)).dependencies, [i1, i2, i3]);
  const [use1] = await sheetUse(v1.versionId);
  assert.deepEqual([use1?.state, use1?.purpose], ['draft', 'reference']);

  await t.test('a next version on the current sheet stays on its use; a rename in the script names the next version', async () => {
    const v2 = saved(await sheets.save(account, video, mara([i1, i2, i3, i4], v1.versionId)));
    assert.equal(v2.revision, 2);
    assert.deepEqual((await sheetUse(v2.versionId)).map(use => [use.use_id, use.state]), [[use1!.use_id, 'draft']]);
    const renamed = await saveScript(account, video, { baseVersionId: first.kind === 'saved' ? first.versionId : '', content: scene(['Mara']), subjects: [{ id: 'mara', kind: 'character', name: 'Mara Vale' }, { id: 'the-gallery', kind: 'place', name: 'The Gallery' }] });
    assert.equal(renamed.kind, 'saved');
    const v3 = saved(await sheets.save(account, video, mara([i1, i2, i3, i4], v2.versionId)));
    assert.deepEqual([v3.revision, v3.subjectName], [3, 'Mara Vale']);
    assert.deepEqual((await versionRow(v3.versionId)).content.subject, { id: 'mara', kind: 'character', name: 'Mara Vale', description: 'A courier in a long grey coat.', continuityNotes: ['Keep the grey coat.'] });
    // An older base is stale and saves nothing.
    assert.deepEqual(await sheets.save(account, video, mara([i1], v1.versionId)), { kind: 'stale' });
    assert.deepEqual(await sheets.save(account, video, mara([i1], null)), { kind: 'stale' });
    assert.equal(await references_(video), 3);
  });

  const current = async () => (await store.workspace(account, video)).assets.find(asset => asset.version.kind === 'reference' && (asset.version as unknown as { content: { subject: { id: string } } }).content.subject.id === 'mara')!.version.id;

  await t.test('a subject must be in the script, and a place\'s sheet has kind environment', async () => {
    assert.deepEqual(await sheets.save(account, video, { ...mara([i1], null), subjectId: 'ben' }), { kind: 'not_in_script' });
    const loose = await image(account, unscripted);
    assert.deepEqual(await sheets.save(account, unscripted, mara([loose], null)), { kind: 'no_script' });
    const i5 = await image(account, video);
    const gallery = saved(await sheets.save(account, video, { subjectId: 'the-gallery', description: 'A white gallery.', continuityNotes: ['Keep the skylight.'], views: views([i5]), baseVersionId: null }));
    assert.deepEqual((await versionRow(gallery.versionId)).content.subject, { id: 'the-gallery', kind: 'environment', name: 'The Gallery', description: 'A white gallery.', continuityNotes: ['Keep the skylight.'] });
    // An image in Mara's sheet can't be in the Gallery's, but stays allowed in Mara's next version.
    assert.deepEqual(await sheets.save(account, video, { subjectId: 'the-gallery', description: 'A white gallery.', continuityNotes: ['Keep the skylight.'], views: views([i5, i1]), baseVersionId: gallery.versionId }), { kind: 'in_other_sheet', subjectName: 'Mara Vale' });
    assert.equal((await sheets.save(account, video, mara([i1, i2], await current()))).kind, 'saved');
  });

  await t.test('a view must be a checked image this video uses, or one the base sheet holds', async () => {
    const base = await current();
    const theirs = await image(other, foreignVideo), otherVideos = await image(account, elsewhere);
    for (const id of [theirs, otherVideos, randomUUID(), 'not an id', first.kind === 'saved' ? first.versionId : '']) assert.deepEqual(await sheets.save(account, video, mara([i1, id], base)), { kind: 'not_found' }, id);
    // An image record without its checked object is not a verified image.
    const unchecked = await transaction(pool, client => publishVersion(client, { accountId: account, conversationId: video, kind: 'image', media: { contentType: 'image/png', byteSize: 10, width: 64, height: 48 }, dependencies: [], createdBy: 'assistant' }));
    assert.deepEqual(await sheets.save(account, video, mara([unchecked.id], base)), { kind: 'invalid', field: 'images' });
    assert.deepEqual(await sheets.save(account, video, mara([i1, i2, i3, i4, otherVideos, theirs], base)), { kind: 'invalid', field: 'images' }, 'six views');
    assert.deepEqual(await sheets.save(account, video, { ...mara([i1, i1], base) }), { kind: 'invalid', field: 'images' }, 'one image twice');
    assert.deepEqual(await sheets.save(account, video, { ...mara([i1], base), views: [{ versionId: i1, view: ' ', notes: [] }] }), { kind: 'invalid', field: 'images' }, 'an empty view name');
    // The sheet's own text is refused as text, not as its images.
    assert.deepEqual(await sheets.save(account, video, { ...mara([i1], base), continuityNotes: [] }), { kind: 'invalid', field: 'text' });
    assert.deepEqual(await sheets.save(account, video, { ...mara([i1], base), description: ' ' }), { kind: 'invalid', field: 'text' });
    assert.deepEqual(await sheets.save(account, video, { ...mara([i1], base), views: [{ versionId: i1, view: 'Front', notes: [' '] }] }), { kind: 'invalid', field: 'text' });
  });

  await t.test('a view whose own use moved on stays in the sheet and still counts as used', async () => {
    const base = await current();
    const edited = await image(account, video, { inputs: [i2], revises: i2 });
    assert.notEqual(edited, i2);
    assert.ok(!(await store.workspace(account, video)).assets.some(asset => asset.version.id === i2), 'i2\'s own use moved to its next version');
    saved(await sheets.save(account, video, mara([i1, i2], base)));
    assert.equal((await readInputs(account, video, [i2])).kind, 'read', 'a sheet view counts as used for inputImages');
    // read-workspace reads that view on its own; an edited image, another video's view or another account's read is not a view.
    const view = await sheets.readView(account, video, i2);
    assert.ok(view.kind === 'found' && view.version.id === i2 && view.version.kind === 'image', JSON.stringify(view));
    for (const [owner, conversation, id] of [[account, video, edited], [account, elsewhere, i2], [other, video, i2]] as const) assert.deepEqual(await sheets.readView(owner, conversation, id), { kind: 'not_found' }, `${owner} ${id}`);
  });

  await t.test('a person\'s sheet with more than 5 views stays valid but the assistant can\'t revise it; a built-in sheet starts an owned one', async () => {
    const people = (await createNativeConversation(native, account)).id;
    const listed = await saveScript(account, people, { baseVersionId: null, content: scene([]), subjects: subjects('Mara') });
    assert.equal(listed.kind, 'saved');
    const six = [];
    for (let n = 0; n < 6; n++) six.push(await image(account, people));
    const theirs = await store.insert({ accountId: account, conversationId: people, kind: 'reference', createdBy: 'human', dependencies: six, content: { schemaVersion: 1, subject: { id: 'mara', kind: 'character', name: 'Mara', description: 'Drawn by hand.', continuityNotes: ['n'] }, references: views(six) }, use: { binding: { purpose: 'reference', role: 'mara' }, state: 'approved' } });
    assert.deepEqual(await sheets.save(account, people, mara(six.slice(0, 3), theirs.id)), { kind: 'invalid', field: 'images' });
    assert.equal(await references_(people), 1);
    // A built-in sheet in use for the subject: the assistant's save starts the account's own sheet on that use.
    const builtIns = await conversation(BUILT_IN_OWNER);
    const sealed = await store.insert({ accountId: BUILT_IN_OWNER, conversationId: builtIns, kind: 'reference', createdBy: 'human', dependencies: [], content: { schemaVersion: 1, subject: { id: 'mara', kind: 'character', name: 'Mara', description: 'A shared example.', continuityNotes: ['n'] }, references: [] } });
    await sealer.query('UPDATE artifacts.artifacts SET built_in=true WHERE owner_id=$1 AND artifact_id=$2', [BUILT_IN_OWNER, sealed.artifactId]);
    const reused = await conversation(account);
    assert.equal((await saveScript(account, reused, { baseVersionId: null, content: scene([]), subjects: subjects('Mara') })).kind, 'saved');
    const view = await image(account, reused);
    const useId = randomUUID();
    await pool.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'reference','draft')", [account, reused, useId, sealed.id, { purpose: 'reference' }]);
    const owned = saved(await sheets.save(account, reused, mara([view], sealed.id)));
    const ownedRow = await versionRow(owned.versionId);
    assert.deepEqual([owned.revision, ownedRow.artifact_id === sealed.artifactId], [1, false]);
    assert.deepEqual((await sheetUse(owned.versionId)).map(use => [use.use_id, use.state]), [[useId, 'draft']]);
  });

  await t.test('at the use limit a new sheet has no room and a next version still saves; useRoom counts what is left', async () => {
    const full = (await createNativeConversation(native, account)).id;
    const listed = await saveScript(account, full, { baseVersionId: null, content: scene([]), subjects: subjects('Mara') });
    assert.equal(listed.kind, 'saved');
    const [a, b] = [await image(account, full), await image(account, full)];
    const sheet = saved(await sheets.save(account, full, mara([a], null)));
    assert.deepEqual(await sheets.useRoom(account, full), { kind: 'room', room: 96 });
    await pool.query(`INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state)
      SELECT $1,$2,gen_random_uuid()::text,$3,jsonb_build_object('purpose','reference','role','extra-'||n),'reference','draft' FROM generate_series(1,96) n`, [account, full, b]);
    assert.deepEqual(await sheets.useRoom(account, full), { kind: 'room', room: 0 });
    assert.deepEqual(await sheets.save(account, full, { subjectId: 'the-gallery', description: 'A white gallery.', continuityNotes: ['n'], views: views([b]), baseVersionId: null }), { kind: 'no_room' });
    assert.equal((await sheets.save(account, full, mara([a, b], sheet.versionId))).kind, 'saved');
    assert.deepEqual(await sheets.useRoom(account, randomUUID()), { kind: 'not_found' });
  });

  await t.test('an image is filed under a script subject on its use; a subject not in the script saves it unfiled and says so', async () => {
    const subjectOf = async (versionId: string) => (await pool.query<{ subject_id: string | null }>('SELECT subject_id FROM artifacts.conversation_uses WHERE owner_id=$1 AND version_id=$2', [account, versionId])).rows.map(row => row.subject_id);
    const asset = async (conversation: string, versionId: string) => (await store.workspace(account, conversation)).assets.find(item => item.version.id === versionId);
    const make = (conversation: string, subject: string, extra: { inputs?: string[]; revises?: string } = {}) => saveImage(account, conversation, { bytes: testPng({ seed: ++seed }), contentType: 'image/png', inputs: extra.inputs ?? [], ...(extra.revises ? { revises: extra.revises } : {}), subject });
    const filed = await make(video, 'mara');
    assert.ok(filed.kind === 'saved' && !filed.subjectLeft, JSON.stringify(filed));
    assert.deepEqual(await subjectOf(filed.versionId), ['mara']);
    assert.equal((await asset(video, filed.versionId))?.subjectId, 'mara');
    // A subject the script doesn't list (here, never did; in the tool, removed while Meta worked) files nothing.
    for (const [conversation, subject] of [[video, 'ben'], [unscripted, 'mara']] as const) {
      const loose = await make(conversation, subject);
      assert.ok(loose.kind === 'saved' && loose.subjectLeft, JSON.stringify(loose));
      assert.deepEqual(await subjectOf(loose.versionId), [null]);
      assert.ok(!('subjectId' in (await asset(conversation, loose.versionId))!), 'an unfiled asset has no subjectId');
    }
    // A next version asked for a subject the script lacks is unfiled too, on the same use.
    const edit = await make(video, 'ben', { inputs: [filed.versionId], revises: filed.versionId });
    assert.ok(edit.kind === 'saved' && edit.subjectLeft, JSON.stringify(edit));
    assert.deepEqual(await subjectOf(edit.versionId), [null]);
    assert.deepEqual(await subjectOf(filed.versionId), [], 'the edit moved the image\'s own use');
  });
});

test('the assistant saves a storyboard from the current script as a draft, keeping Shot and panel ids and never over newer work', { timeout: 120000 }, async t => {
  const db = await testStack().testDatabase();
  const native = new PostgresStore({ id: 'assistant-storyboards', connectionString: db.setupUrl, schemaName: 'mastra' });
  const pool = new Pool({ connectionString: db.servingUrl, max: 4 }), sealer = new Pool({ connectionString: db.setupUrl, max: 1 });
  t.after(async () => { await pool.end(); await sealer.end(); await native.close(); await db.close(); });
  await native.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
  const check = createOwnedConversationCheck(native), store = createArtifactStore(pool, check);
  const saveScript = createAssistantScriptSaver(createAssistantScripts(pool, check).save);
  const save = createAssistantStoryboardSaver(createAssistantStoryboards(pool, check).save);
  const account = 'board-owner';
  const conversation = async (owner = account) => (await createNativeConversation(native, owner)).id;
  const scene = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters: ['Mara'], script: [{ action: 'Mara waits.' }, { dialogue: { character: 'Mara', text: 'Anyone here?' } }] }] };
  const scriptedFor = async (owner: string, video: string) => {
    const saved = await saveScript(owner, video, { baseVersionId: null, content: scene, subjects: [{ id: '', kind: 'character', name: 'Mara' }, { id: '', kind: 'place', name: 'The Gallery' }, { id: '', kind: 'prop', name: 'The key' }] });
    assert.equal(saved.kind, 'saved'); return (saved as { versionId: string }).versionId;
  };
  const scripted = (video: string) => scriptedFor(account, video);
  const sheet = (video: string, subject: string, kind: 'character' | 'environment') => store.insert({ accountId: account, conversationId: video, kind: 'reference', createdBy: 'human', dependencies: [], content: { schemaVersion: 1, subject: { id: subject, kind, name: subject, description: 'Drawn.', continuityNotes: ['n'] }, references: [] }, use: { binding: { purpose: 'reference' }, state: 'approved' } });
  const opening = (ids: { shot?: string; panels?: string[] } = {}) => ({ shotId: ids.shot ?? '', intent: 'Mara arrives.', framing: 'wide', action: 'Mara steps in out of the rain.', cameraNote: 'Slow push in.',
    dialogue: [{ character: 'Mara', text: 'Anyone here?' }, { character: 'Narrator', text: 'It was late.', delivery: 'voice_over' as const }],
    references: [{ subjectId: 'mara', role: 'identity' as const, purpose: 'Her face and coat.' }, { subjectId: 'the-gallery', role: 'environment' as const, purpose: 'The room.' }],
    panels: [{ panelId: ids.panels?.[0] ?? '', description: 'Mara in the doorway.' }, { panelId: ids.panels?.[1] ?? '', description: 'Mara at the desk.' }] });
  const closing = (shot = '', panel = '') => ({ shotId: shot, intent: 'The key turns.', panels: [{ panelId: panel, description: 'The key in the lock.' }] });
  const saved = (outcome: AssistantStoryboardOutcome) => { assert.equal(outcome.kind, 'saved', JSON.stringify(outcome)); return outcome as Extract<AssistantStoryboardOutcome, { kind: 'saved' }>; };
  const revision = async (video: string) => (await pool.query<{ revision: number }>('SELECT COALESCE(max(revision),0)::int AS revision FROM artifacts.selection_revisions WHERE conversation_id=$1', [video])).rows[0]!.revision;
  const boardUse = async (video: string) => (await pool.query<{ use_id: string; version_id: string; state: string }>("SELECT use_id,version_id,state FROM artifacts.conversation_uses WHERE conversation_id=$1 AND purpose='storyboard'", [video])).rows;

  const video = await conversation(), scriptVersion = await scripted(video);
  const maraSheet = await sheet(video, 'mara', 'character');
  const v1 = saved(await save(account, video, { baseVersionId: null, shots: [opening(), closing()] }));
  const read1 = await store.version(account, v1.versionId);
  assert.ok('content' in read1);
  const plan1 = read1.content as { sourceScriptVersionId: string; shots: { shotId: string; order: number; framing?: string; references?: unknown[]; dialogue?: unknown[]; panels: { panelId: string; references: unknown[] }[] }[] };
  assert.equal(v1.revision, 1);
  assert.equal(plan1.sourceScriptVersionId, scriptVersion);
  assert.deepEqual(read1.dependencies, [scriptVersion, maraSheet.id], 'the script and the referenced subjects\' current sheets; the Gallery has no sheet yet');
  assert.equal(read1.createdBy, 'assistant');
  assert.deepEqual(plan1.shots.map(shot => [shot.order, shot.panels.length, shot.panels.every(panel => panel.references.length === 0)]), [[0, 2, true], [1, 1, true]]);
  assert.equal(plan1.shots[0]!.framing, 'wide');
  assert.equal(plan1.shots[0]!.dialogue?.length, 2);
  const [use1] = await boardUse(video);
  assert.equal(use1?.state, 'draft');
  assert.equal(await revision(video), 1, 'the first save is a change of the Shot sequence');
  assert.equal(Number((await pool.query<{ count: string }>('SELECT count(*) FROM artifacts.manual_changes WHERE conversation_id=$1', [video])).rows[0]!.count), 0, 'no journal row (B-036)');
  // The in-process read applies the strict workspace contract, as the browser's does.
  const read = await createWorkspaceReader(store)(account, video);
  assert.equal(read.kind, 'found', 'a workspace holding an agent storyboard passes the strict contract');
  const [shown] = (read as Extract<typeof read, { kind: 'found' }>).workspace.storyboard.shots;
  const asked = opening();
  assert.deepEqual([shown!.intent, shown!.framing, shown!.action, shown!.dialogue, shown!.cameraNote, shown!.references], [asked.intent, asked.framing, asked.action, asked.dialogue, asked.cameraNote, asked.references]);
  const [shotA, shotB] = plan1.shots;

  await t.test('a revision keeping a Shot\'s ids keeps its panel images, moves the same use as a draft, and advances the revision only on a sequence change', async () => {
    const image = await transaction(pool, client => publishVersion(client, { accountId: account, conversationId: video, kind: 'image', createdBy: 'human', dependencies: [], media: { contentType: 'image/png', byteSize: 2048, width: 64, height: 36 } }));
    await pool.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'panel_image','approved')", [account, video, randomUUID(), image.id, { purpose: 'panel_image', shotId: shotA!.shotId, panelId: shotA!.panels[0]!.panelId }]);
    await pool.query("UPDATE artifacts.conversation_uses SET state='approved' WHERE use_id=$1", [use1!.use_id]);
    const text = saved(await save(account, video, { baseVersionId: v1.versionId, shots: [{ ...opening({ shot: shotA!.shotId, panels: shotA!.panels.map(panel => panel.panelId) }), action: 'Mara shakes off the rain.' }, closing(shotB!.shotId, shotB!.panels[0]!.panelId)] }));
    assert.equal(text.revision, 2);
    assert.deepEqual((await boardUse(video)).map(use => [use.use_id, use.version_id, use.state]), [[use1!.use_id, text.versionId, 'draft']]);
    assert.equal(await revision(video), 1, 'a text change leaves the selection revision');
    const panel = (await store.workspace(account, video)).storyboard.shots.find(shot => shot.shotId === shotA!.shotId)?.panels[0];
    assert.equal(panel?.approvedImageVersionId, image.id, 'the kept panel keeps its image');
    const reordered = saved(await save(account, video, { baseVersionId: text.versionId, shots: [closing(shotB!.shotId, shotB!.panels[0]!.panelId), opening({ shot: shotA!.shotId, panels: shotA!.panels.map(item => item.panelId) })] }));
    assert.equal(await revision(video), 2, 'a reorder advances it');
    const added = saved(await save(account, video, { baseVersionId: reordered.versionId, shots: [closing(shotB!.shotId, shotB!.panels[0]!.panelId), opening({ shot: shotA!.shotId, panels: shotA!.panels.map(item => item.panelId) }), closing()] }));
    assert.equal(await revision(video), 3, 'an added Shot advances it');
    // An earlier base is stale, and an empty base when a storyboard exists is stale too.
    assert.deepEqual(await save(account, video, { baseVersionId: v1.versionId, shots: [closing()] }), { kind: 'stale' });
    assert.deepEqual(await save(account, video, { baseVersionId: null, shots: [closing()] }), { kind: 'stale' });
    assert.deepEqual(await save(account, video, { baseVersionId: maraSheet.id, shots: [closing()] }), { kind: 'not_found' });
    // Another account's video, or its storyboard as the base, is not found and writes nothing.
    const foreign = await conversation('board-other');
    await scriptedFor('board-other', foreign);
    const theirs = saved(await save('board-other', foreign, { baseVersionId: null, shots: [closing()] }));
    const versions = async () => (await pool.query('SELECT 1 FROM artifacts.versions')).rowCount;
    const count = await versions();
    assert.deepEqual(await save(account, foreign, { baseVersionId: theirs.versionId, shots: [closing()] }), { kind: 'not_found' });
    assert.deepEqual(await save(account, video, { baseVersionId: theirs.versionId, shots: [closing()] }), { kind: 'not_found' });
    assert.equal(await versions(), count);
    // An id the base doesn't have, or a panel moved under another Shot, would silently detach work.
    assert.deepEqual(await save(account, video, { baseVersionId: added.versionId, shots: [closing(randomUUID())] }), { kind: 'invalid', field: 'shots[0].shotId' });
    assert.deepEqual(await save(account, video, { baseVersionId: added.versionId, shots: [closing(shotB!.shotId, shotA!.panels[0]!.panelId)] }), { kind: 'invalid', field: 'shots[0].panels[0].panelId' });
  });

  await t.test('Shots name subjects of the script with fitting roles, speakers of its scene, and at most two panels', async () => {
    const fresh = await conversation();
    assert.deepEqual(await save(account, fresh, { baseVersionId: null, shots: [closing()] }), { kind: 'no_script' });
    await scripted(fresh);
    assert.deepEqual(await save(account, fresh, { baseVersionId: null, shots: [{ ...closing(), references: [{ subjectId: 'ben', role: 'identity', purpose: 'His face.' }] }] }), { kind: 'not_in_script', field: 'shots[0].references[0].subjectId' });
    assert.deepEqual(await save(account, fresh, { baseVersionId: null, shots: [{ ...closing(), references: [{ subjectId: 'mara', role: 'environment', purpose: 'The room.' }] }] }), { kind: 'role', field: 'shots[0].references[0].role' });
    assert.deepEqual(await save(account, fresh, { baseVersionId: null, shots: [{ ...closing(), dialogue: [{ character: 'Ben', text: 'Hello.' }] }] }), { kind: 'invalid', field: 'shots[0].dialogue[0].character' });
    assert.deepEqual(await save(account, fresh, { baseVersionId: null, shots: [{ ...closing(), panels: [closing().panels[0]!, closing().panels[0]!, closing().panels[0]!] }] }), { kind: 'invalid', field: 'shots[0].panels' });
    assert.deepEqual(await save(account, fresh, { baseVersionId: null, shots: [{ ...closing(), framing: 'x'.repeat(81) }] }), { kind: 'invalid', field: 'shots[0].framing' });
    // A composition reference fits any kind, and a subject with no sheet yet may be referenced.
    const ok = saved(await save(account, fresh, { baseVersionId: null, shots: [{ ...closing(), references: [{ subjectId: 'the-key', role: 'composition', purpose: 'Centre frame.' }] }] }));
    assert.equal((await store.version(account, ok.versionId)).dependencies.length, 1);
    assert.equal((await pool.query('SELECT 1 FROM artifacts.versions WHERE origin_conversation_id=$1 AND kind=$2', [fresh, 'storyboard'])).rowCount, 1, 'refusals save nothing');
  });

  await t.test('a built-in storyboard in use starts an owned one on the same use, keeping the given ids', async () => {
    const shared = await conversation();
    const source = await scripted(shared);
    const builtIns = await conversation(BUILT_IN_OWNER);
    const builtInScript = await store.insert({ accountId: BUILT_IN_OWNER, conversationId: builtIns, kind: 'script', createdBy: 'human', dependencies: [], content: scene });
    const sealed = await store.insert({ accountId: BUILT_IN_OWNER, conversationId: builtIns, kind: 'storyboard', createdBy: 'human', dependencies: [builtInScript.id], content: { schemaVersion: 1, sourceScriptVersionId: builtInScript.id, shots: [{ shotId: 'shared-shot', order: 0, intent: 'An example.', panels: [{ panelId: 'shared-panel', order: 0, description: 'Example.', references: [] }] }] } });
    await sealer.query('UPDATE artifacts.artifacts SET built_in=true WHERE owner_id=$1 AND artifact_id IN ($2,$3)', [BUILT_IN_OWNER, sealed.artifactId, builtInScript.artifactId]);
    const useId = randomUUID();
    await pool.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'storyboard','approved')", [account, shared, useId, sealed.id, { purpose: 'storyboard' }]);
    const owned = saved(await save(account, shared, { baseVersionId: sealed.id, shots: [closing('shared-shot', 'shared-panel')] }));
    const read = await store.version(account, owned.versionId);
    assert.ok('content' in read);
    assert.deepEqual([owned.revision, read.artifactId === sealed.artifactId, (read.content as { sourceScriptVersionId: string }).sourceScriptVersionId], [1, false, source]);
    assert.deepEqual((read.content as { shots: { shotId: string; panels: { panelId: string }[] }[] }).shots.map(shot => [shot.shotId, shot.panels[0]!.panelId]), [['shared-shot', 'shared-panel']]);
    assert.deepEqual((await boardUse(shared)).map(use => [use.use_id, use.version_id, use.state]), [[useId, owned.versionId, 'draft']]);
  });

  await t.test('a kept panel keeps the reference versions a person gave it', async () => {
    const given = await conversation();
    const source = await scripted(given);
    const lead = await sheet(given, 'mara', 'character');
    const placed = await store.insert({ accountId: account, conversationId: given, kind: 'storyboard', createdBy: 'human', dependencies: [source, lead.id], use: { binding: { purpose: 'storyboard' }, state: 'approved' },
      content: { schemaVersion: 1, sourceScriptVersionId: source, shots: [{ shotId: 'given-shot', order: 0, intent: 'Mara waits.', panels: [{ panelId: 'given-panel', order: 0, description: 'Mara alone.', references: [lead.id] }] }] } });
    const kept = saved(await save(account, given, { baseVersionId: placed.id, shots: [closing('given-shot', 'given-panel'), closing()] }));
    const read = await store.version(account, kept.versionId);
    assert.ok('content' in read);
    assert.deepEqual((read.content as { shots: { panels: { references: string[] }[] }[] }).shots.map(shot => shot.panels[0]!.references), [[lead.id], []]);
    assert.deepEqual(read.dependencies, [source, lead.id]);
  });

  await t.test('at the use limit a first storyboard has no room and a revision still saves', async () => {
    const full = await conversation();
    await scripted(full);
    const filler = await transaction(pool, client => publishVersion(client, { accountId: account, conversationId: full, kind: 'image', createdBy: 'human', dependencies: [], media: { contentType: 'image/png', byteSize: 4096, width: 64, height: 36 } }));
    await pool.query(`INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state)
      SELECT $1,$2,gen_random_uuid()::text,$3,jsonb_build_object('purpose','reference','role','extra-'||n),'reference','draft' FROM generate_series(1,99) n`, [account, full, filler.id]);
    assert.deepEqual(await save(account, full, { baseVersionId: null, shots: [closing()] }), { kind: 'no_room' }, 'the script and 99 images fill the video');
    await sealer.query("DELETE FROM artifacts.conversation_uses WHERE owner_id=$1 AND conversation_id=$2 AND binding->>'role'='extra-1'", [account, full]);
    const first = saved(await save(account, full, { baseVersionId: null, shots: [closing()] }));
    assert.equal((await pool.query('SELECT 1 FROM artifacts.conversation_uses WHERE conversation_id=$1', [full])).rowCount, 100);
    assert.equal((await save(account, full, { baseVersionId: first.versionId, shots: [closing(), closing()] })).kind, 'saved', 'a revision moves its own use');
  });
});
