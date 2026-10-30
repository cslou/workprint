import { randomUUID } from 'node:crypto';
import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import { savedReferenceContentSchema, savedScriptContentSchema, savedStoryboardContentSchema, type Version } from '@workprint/contracts';
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

/** Real stale prerequisites for independent visual states; no runtime write or display override. */
export async function prepareManualVisualWork(setup: SavedWorkSetup) {
  const ordinary = await prepareManualSavedWork(setup, { referenceApproved: true });
  const changed = await prepareManualSavedWork(setup, { referenceApproved: true });
  const pool = new Pool({ connectionString: setup.servingUrl, max: 2, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  try {
    const store = createArtifactStore(pool, createOwnedConversationCheck(setup.native));
    for (const [work, structural] of [[ordinary, false], [changed, true]] as const) {
      if (!('content' in work.script)) throw new Error('Script prerequisite missing');
      const content = savedScriptContentSchema.parse(work.script.content);
      content.scenes[0]!.script = structural ? [{ action: 'A changed structure.' }, { dialogue: { character: 'Ada', text: 'Is the train here?' } }] : [{ action: 'Ada walks past the station clock and waits beside the platform entrance.' }];
      await store.insert({ accountId: work.accountId, conversationId: work.conversationId, artifactId: work.script.artifactId, kind: 'script', createdBy: 'assistant', dependencies: [], content });
    }
    if (!('content' in ordinary.reference) || !('content' in ordinary.planning)) throw new Error('Text prerequisites missing');
    const reference = savedReferenceContentSchema.parse(ordinary.reference.content); reference.subject.description = 'A newer saved description.';
    await store.insert({ accountId: ordinary.accountId, conversationId: ordinary.conversationId, artifactId: ordinary.reference.artifactId, kind: 'reference', createdBy: 'assistant', dependencies: [], content: reference });
    const planning = savedStoryboardContentSchema.parse(ordinary.planning.content); planning.shots[0]!.panels[0]!.description = 'A newer saved Panel description.';
    await store.insert({ accountId: ordinary.accountId, conversationId: ordinary.conversationId, artifactId: ordinary.planning.artifactId, kind: 'storyboard', createdBy: 'assistant', dependencies: ordinary.planning.dependencies, content: planning });
    return { ordinary, changed };
  } finally { await pool.end(); }
}

export type ManualSavedWork = { accountId: string; conversationId: string; otherConversationId: string; script: Version; reference: Version; planning: Version };
/** Synthetic existing records through domain/native setup only, never a producer/seed route. */
export async function prepareManualSavedWork({ accountIds, native, servingUrl }: SavedWorkSetup, options: { referenceApproved?: boolean } = {}): Promise<ManualSavedWork> {
  const accountId = accountIds[0];
  if (!accountId) throw new Error('An admitted synthetic account is required');
  const conversation = await createNativeConversation(native, accountId);
  const other = await createNativeConversation(native, accountId);
  const pool = new Pool({ connectionString: servingUrl, max: 2, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  try {
    const store = createArtifactStore(pool, createOwnedConversationCheck(native));
    const script = await store.insert({ accountId, conversationId: conversation.id, kind: 'script', createdBy: 'human', content: { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'Ada waits beside the station clock.' }] }] }, dependencies: [], use: { binding: { purpose: 'script' }, state: 'approved' } });
    const reference = await store.insert({ accountId, conversationId: conversation.id, kind: 'reference', createdBy: 'human', content: { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada reference', description: 'A traveller with a green coat.', continuityNotes: ['Keep the green coat.'] }, references: [] }, dependencies: [], use: { binding: { purpose: 'reference', role: 'ada' }, state: options.referenceApproved ? 'approved' : 'draft' } });
    const planning = await store.insert({ accountId, conversationId: conversation.id, kind: 'storyboard', createdBy: 'human', content: { schemaVersion: 1, sourceScriptVersionId: script.id, shots: [{ shotId: 'station-shot', order: 0, intent: 'Ada waits for the train.', panels: [{ panelId: 'station-panel', order: 0, description: 'Ada looks toward the arriving train.', references: [reference.id] }] }] }, dependencies: [script.id, reference.id], use: { binding: { purpose: 'storyboard' }, state: 'approved' } });
    return { accountId, conversationId: conversation.id, otherConversationId: other.id, script, reference, planning };
  } finally { await pool.end(); }
}
