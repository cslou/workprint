import { Pool } from 'pg';
import type { Version } from '@workprint/contracts';
import { createArtifactStore } from '../src/artifacts/store.js';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import type { SavedWorkSetup } from './auth-built-fixture.js';
import { createNativeConversation } from './native-conversations.js';

export type OwnedSavedWork = { conversationA: string; emptyConversationA: string; conversationB: string; scriptVersions: Version[]; reference: Version; foreign: Version };
/** Synthetic prerequisites persisted through the domain and supported native APIs, never HTTP. */
export async function prepareOwnedSavedWork({ accountIds, native, servingUrl }: SavedWorkSetup): Promise<OwnedSavedWork> {
  const [accountA, accountB] = accountIds;
  if (!accountA || !accountB || accountA === accountB) throw new Error('Distinct admitted fixture accounts required');
  const a = await createNativeConversation(native, accountA);
  const empty = await createNativeConversation(native, accountA);
  const b = await createNativeConversation(native, accountB);
  const pool = new Pool({ connectionString: servingUrl, max: 2, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  try {
    const store = createArtifactStore(pool, createOwnedConversationCheck(native));
    const script = (action: string) => ({ schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action }] }] });
    const first = await store.insert({ accountId: accountA, conversationId: a.id, kind: 'script', createdBy: 'human', dependencies: [], content: script('Ada waits beside the station clock.'), use: { binding: { purpose: 'script' }, state: 'approved' } });
    const second = await store.insert({ accountId: accountA, conversationId: a.id, artifactId: first.artifactId, kind: 'script', createdBy: 'human', dependencies: [first.id], content: script('Ada checks her ticket beside the station clock.') });
    const third = await store.insert({ accountId: accountA, conversationId: a.id, artifactId: first.artifactId, kind: 'script', createdBy: 'assistant', dependencies: [second.id], content: script('Ada folds her ticket and watches the empty platform.') });
    const reference = await store.insert({ accountId: accountA, conversationId: a.id, kind: 'reference', createdBy: 'human', dependencies: [], content: { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada reference', description: 'A traveller with a green coat.', continuityNotes: ['Keep the green coat.'] }, references: [] }, use: { binding: { purpose: 'reference', role: 'ada' }, state: 'draft' } });
    const foreign = await store.insert({ accountId: accountB, conversationId: b.id, kind: 'script', createdBy: 'human', dependencies: [], content: script('Ben waits on a different platform.') });
    return { conversationA: a.id, emptyConversationA: empty.id, conversationB: b.id, scriptVersions: [first, second, third], reference, foreign };
  } finally { await pool.end(); }
}
