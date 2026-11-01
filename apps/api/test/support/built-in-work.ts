import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import { createArtifactStore } from '../../src/artifacts/index.js';
import { createOwnedConversationCheck } from '../../src/agent/index.js';
import { createNativeConversation } from './native-conversations.js';
import type { SavedWorkSetup } from './auth-built-fixture.js';

/** Isolated test-only read-only source; no catalog, public seed or real example assets. */
export async function prepareBuiltInScript(setup: SavedWorkSetup) {
  if (!setup.setupUrl) throw new Error('Owned setup role required for a test-only sealed source');
  const source = 'workprint-built-in', origin = await createNativeConversation(setup.native, source);
  const pool = new Pool({ connectionString: setup.servingUrl, max: 2 });
  const sealer = new Pool({ connectionString: setup.setupUrl, max: 1 });
  const native = new PostgresStore({ id: 'builtin-source-setup', schemaName: 'mastra', disableInit: true, pool });
  try {
    const store = createArtifactStore(pool, createOwnedConversationCheck(native));
    const version = await store.insert({ accountId: source, conversationId: origin.id, kind: 'script', createdBy: 'human', dependencies: [], content: { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'An independently authored immutable fixture.' }] }] } });
    await sealer.query('UPDATE artifacts.artifacts SET built_in=true WHERE owner_id=$1 AND artifact_id=$2', [source, version.artifactId]);
    return version;
  } finally { await native.close(); if (!pool.ended) await pool.end(); await sealer.end(); }
}
