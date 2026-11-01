import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';
import type { Version } from '@workprint/contracts';
import { createOwnedConversationCheck } from '../../src/agent/index.js';
import { createArtifactStore } from '../../src/artifacts/index.js';
import { createNativeConversation } from '../support/native-conversations.js';
import { query } from '../support/postgres.js';
import { testStack, type TestDatabase } from '../support/test-stack.js';
import { applyArtifactMigrations } from '../support/artifact-database.js';

const content = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: [], script: [{ action: 'An empty train arrives.' }] }] };

describe('owned artifact persistence and reads', { timeout: 120000 }, () => {
  let db: TestDatabase, pool: Pool, native: PostgresStore, serving: PostgresStore;
  let store: ReturnType<typeof createArtifactStore>, conversation: string, otherConversation: string;
  let insert: Parameters<ReturnType<typeof createArtifactStore>['insert']>[0];
  let first: Version, second: Version, historyCursor: string, libraryCursor: string;
  before(async () => {
    db = await testStack().testDatabase();
    pool = new Pool({ connectionString: db.servingUrl, max: 4, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
    native = new PostgresStore({ id: 'artifact-reads-native', connectionString: db.setupUrl, schemaName: 'mastra' });
    serving = new PostgresStore({ id: 'artifact-reads-serving', schemaName: 'mastra', disableInit: true, pool });
    await native.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
    conversation = (await createNativeConversation(native, 'account-a')).id;
    otherConversation = (await createNativeConversation(native, 'account-b')).id;
    store = createArtifactStore(pool, createOwnedConversationCheck(serving));
    insert = { accountId: 'account-a', conversationId: conversation, kind: 'script', content, dependencies: [], createdBy: 'human' };
  });
  after(async () => { await native?.close(); await serving?.close(); if (pool && !pool.ended) await pool.end(); await db?.close(); });

  test('a new conversation has an empty workspace', async () => {
    assert.deepEqual(await store.workspace('account-a', conversation), { script: null, assets: [], storyboard: { work: null, shots: [] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 0 });
  });

  test('versions keep their revision, dependencies and content', async () => {
    first = await store.insert({ ...insert, use: { binding: { purpose: 'script' }, state: 'approved' } });
    second = await store.insert({ ...insert, artifactId: first.artifactId, dependencies: [first.id] });
    assert.equal(second.revision, 2);
    assert.deepEqual((await store.version('account-a', second.id)).dependencies, [first.id]);
    const restored = await store.version('account-a', first.id);
    assert.ok('content' in restored); assert.deepEqual(restored.content, content);
  });

  test('a newer version never replaces the exact version used in a conversation', async () => {
    const work = await store.workspace('account-a', conversation);
    assert.equal(work.script?.version.id, first.id);
    assert.equal(work.script?.state, 'Ready');
    assert.equal((await store.library('account-a')).items[0]?.latestVersion.id, second.id);
  });

  test('a history cursor stays stable when versions are added', async () => {
    const page = await store.history('account-a', first.artifactId, { limit: 1 });
    assert.deepEqual(page.items.map(item => item.id), [second.id]); assert.ok(page.nextCursor);
    historyCursor = page.nextCursor;
    await store.insert({ ...insert, artifactId: first.artifactId });
    assert.deepEqual((await store.history('account-a', first.artifactId, { limit: 1, cursor: historyCursor })).items.map(item => item.id), [first.id]);
  });

  test('a Library page snapshot excludes artifacts created after it', async () => {
    await store.insert(insert);
    const page = await store.library('account-a', { limit: 1, kind: 'script' });
    assert.ok(page.nextCursor); libraryCursor = page.nextCursor;
    await store.insert(insert);
    const next = await store.library('account-a', { limit: 1, kind: 'script', cursor: libraryCursor });
    assert.equal(next.items.length, 1); assert.equal(next.nextCursor, null);
  });

  test('foreign and unknown reads share one not-found denial', async () => {
    for (const action of [
      () => store.history('account-b', first.artifactId), () => store.version('account-b', first.id),
      () => store.version('account-a', 'unknown'), () => store.workspace('account-a', otherConversation),
      () => store.workspace('account-a', 'unknown'),
    ]) await assert.rejects(action, { code: 'not_found', message: 'Saved work not found' });
  });

  test('cursors are bound to their account, kind and artifact', async () => {
    for (const action of [
      () => store.library('account-b', { limit: 1, kind: 'script', cursor: libraryCursor }),
      () => store.library('account-a', { limit: 1, kind: 'reference', cursor: libraryCursor }),
      () => store.history('account-a', first.artifactId, { cursor: historyCursor + 'x', limit: 1 }),
      () => store.library('account-a', { limit: 101 }),
    ]) await assert.rejects(action, { code: 'invalid_input' });
  });

  test('denied writes leave no partial rows', async () => {
    const counts = async () => (await query(db.servingUrl, 'SELECT (SELECT count(*) FROM artifacts.artifacts) AS artifacts, (SELECT count(*) FROM artifacts.versions) AS versions, (SELECT count(*) FROM artifacts.conversation_uses) AS uses')).rows;
    const initial = await counts();
    const foreign = await store.insert({ ...insert, accountId: 'account-b', conversationId: otherConversation });
    const before = await counts();
    // The serving role sees the allowed write, so unchanged counts below mean nothing was written.
    assert.notDeepEqual(before, initial);
    for (const input of [
      { ...insert, conversationId: otherConversation }, { ...insert, dependencies: [foreign.id] },
      { ...insert, dependencies: ['unknown'] }, { ...insert, artifactId: foreign.artifactId },
      { ...insert, createdBy: 'assistant' as const, use: { binding: { purpose: 'script' as const }, state: 'approved' as const } },
    ]) await assert.rejects(store.insert(input));
    assert.deepEqual(await counts(), before);
  });

  test('SQL guards keep versions immutable and links owned', async () => {
    await assert.rejects(query(db.setupUrl, `UPDATE artifacts.versions SET revision=99 WHERE version_id='${first.id}'`), /immutable/);
    await assert.rejects(query(db.servingUrl, `INSERT INTO artifacts.version_dependencies(owner_id,version_id,dependency_id,position) VALUES('account-a','unknown','${first.id}',0)`), /foreign key/);
    await assert.rejects(query(db.servingUrl, `INSERT INTO artifacts.version_dependencies(owner_id,version_id,dependency_id,position) VALUES('account-a','${first.id}','missing',0)`), { code: '23514', message: 'Version link is not owned or read-only' });
  });
});
