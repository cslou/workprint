import { Pool } from 'pg';
import { createOwnedConversationCheck } from '../../src/agent/index.js';
import { createArtifactStore } from '../../src/artifacts/index.js';
import { prepareManualSavedWork } from './manual-saved-work.js';
import { prepareBuiltInScript } from './built-in-work.js';
import type { SavedWorkSetup } from './auth-built-fixture.js';

/** Test-only existing work. No examples catalog, producer or browser read substitution. */
export async function prepareLibraryReuseWork(setup: SavedWorkSetup) {
  const work = await prepareManualSavedWork(setup), pool = new Pool({ connectionString: setup.servingUrl, max: 2 });
  try {
    const secondReference = await createArtifactStore(pool, createOwnedConversationCheck(setup.native)).insert({ accountId: work.accountId, conversationId: work.conversationId, kind: 'reference', createdBy: 'human', dependencies: [], content: { schemaVersion: 1, subject: { id: 'station', kind: 'environment', name: 'Station reference', description: 'A quiet station platform.', continuityNotes: ['Keep the platform clock.'] }, references: [] } });
    return { ...work, secondReference, builtin: await prepareBuiltInScript(setup) };
  } finally { await pool.end(); }
}
