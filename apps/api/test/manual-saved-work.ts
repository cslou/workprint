import { randomUUID } from 'node:crypto';
import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import type { Version } from '@workprint/contracts';
import { createArtifactStore, createArtifactWriters } from '../src/artifacts/index.js';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { createNativeConversation } from './native-conversations.js';
import type { SavedWorkSetup } from './auth-built-fixture.js';

/** Publish a real draft prerequisite through the draft-only capability, never a browser override. */
export async function publishManualScriptDraft(servingUrl: string, saved: ManualSavedWork, base: Version) {
  const pool = new Pool({ connectionString: servingUrl, max: 2, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  const native = new PostgresStore({ id: 'manual-draft-prerequisite', schemaName: 'mastra', disableInit: true, pool });
  try {
    return await createArtifactWriters(pool, createOwnedConversationCheck(native)).assistant.save(saved.accountId, saved.conversationId, { operationId: randomUUID(), artifactId: base.artifactId, baseVersionId: base.id, kind: 'script', dependencies: base.dependencies, content: { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'A new scene structure arrives.' }, { dialogue: { character: 'Ada', text: 'Is the train here?' } }] }] } });
  } finally { await native.close(); if (!pool.ended) await pool.end(); }
}

export type ManualSavedWork = { accountId: string; conversationId: string; otherConversationId: string; script: Version; reference: Version; planning: Version };
/** Synthetic existing records through domain/native setup only, never a producer/seed route. */
export async function prepareManualSavedWork({ accountIds, native, servingUrl }: SavedWorkSetup): Promise<ManualSavedWork> {
  const accountId = accountIds[0];
  if (!accountId) throw new Error('An admitted synthetic account is required');
  const conversation = await createNativeConversation(native, accountId);
  const other = await createNativeConversation(native, accountId);
  const pool = new Pool({ connectionString: servingUrl, max: 2, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  try {
    const store = createArtifactStore(pool, createOwnedConversationCheck(native));
    const script = await store.insert({ accountId, conversationId: conversation.id, kind: 'script', createdBy: 'human', content: { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'Ada waits beside the station clock.' }] }] }, dependencies: [], use: { binding: { purpose: 'script' }, state: 'approved' } });
    const reference = await store.insert({ accountId, conversationId: conversation.id, kind: 'reference', createdBy: 'human', content: { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada reference', description: 'A traveller with a green coat.', continuityNotes: ['Keep the green coat.'] }, references: [] }, dependencies: [], use: { binding: { purpose: 'reference', role: 'ada' }, state: 'draft' } });
    const planning = await store.insert({ accountId, conversationId: conversation.id, kind: 'storyboard', createdBy: 'human', content: { schemaVersion: 1, sourceScriptVersionId: script.id, shots: [{ shotId: 'station-shot', order: 0, intent: 'Ada waits for the train.', panels: [{ panelId: 'station-panel', order: 0, description: 'Ada looks toward the arriving train.', references: [reference.id] }] }] }, dependencies: [script.id, reference.id], use: { binding: { purpose: 'storyboard' }, state: 'approved' } });
    return { accountId, conversationId: conversation.id, otherConversationId: other.id, script, reference, planning };
  } finally { await pool.end(); }
}
