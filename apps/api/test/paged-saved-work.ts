import { Pool } from 'pg';
import type { Version } from '@workprint/contracts';
import { createArtifactStore } from '../src/artifacts/index.js';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import type { SavedWorkSetup } from './auth-built-fixture.js';
import { createNativeConversation } from './native-conversations.js';

export type PagedSavedWork = { accountA: string; accountB: string; conversationA: string; emptyA: string; emptyB: string; current: Version; versions: Version[]; reference: Version };
/** Independently authored read-only prerequisites. No production fixture control or route. */
export async function preparePagedSavedWork({ accountIds, native, servingUrl }: SavedWorkSetup, currentRevision = 23): Promise<PagedSavedWork> {
  if (!Number.isInteger(currentRevision) || currentRevision < 1 || currentRevision > 23) throw new Error('Pinned fixture revision must be between 1 and 23');
  const [accountA, accountB] = accountIds;
  if (!accountA || !accountB || accountA === accountB) throw new Error('Distinct verified accounts required');
  const conversation = await createNativeConversation(native, accountA);
  const emptyA = await createNativeConversation(native, accountA);
  const emptyB = await createNativeConversation(native, accountB);
  const pool = new Pool({ connectionString: servingUrl, max: 2, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  try {
    const store = createArtifactStore(pool, createOwnedConversationCheck(native));
    const script = (action: string) => ({ schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: [], script: [{ action }] }] });
    const versions: Version[] = [];
    for (let revision = 1; revision <= 23; revision++) {
      versions.push(await store.insert({ accountId: accountA, conversationId: conversation.id, kind: 'script', createdBy: 'human', dependencies: [], ...(versions[0] ? { artifactId: versions[0].artifactId } : {}), content: script(revision === 23 ? 'Ada waits beside the station clock.' : `Earlier Script revision ${revision}.`), ...(revision === currentRevision ? { use: { binding: { purpose: 'script' as const }, state: 'approved' as const } } : {}) }));
    }
    const reference = await store.insert({ accountId: accountA, conversationId: conversation.id, kind: 'reference', createdBy: 'human', dependencies: [], content: { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada reference', description: 'A traveller in a green coat.', continuityNotes: ['Keep the green coat.'] }, references: [] }, use: { binding: { purpose: 'reference', role: 'ada' }, state: 'draft' } });
    for (let index = 0; index < 22; index++) await store.insert({ accountId: accountA, conversationId: conversation.id, kind: 'script', createdBy: 'human', dependencies: [], content: script(`Synthetic saved Script ${index + 1}.`) });
    return { accountA, accountB, conversationA: conversation.id, emptyA: emptyA.id, emptyB: emptyB.id, current: versions[currentRevision - 1]!, versions, reference };
  } finally { await pool.end(); }
}
