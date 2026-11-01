import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { Version } from '@workprint/contracts';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { createArtifactStore } from '../src/artifacts/index.js';
import { publishVersion } from '../src/artifacts/publication.js';
import { transaction } from '../src/db/index.js';
import { createNativeConversation } from './native-conversations.js';
import type { SavedWorkSetup } from './auth-built-fixture.js';

export type ShotChoiceWork = { accountId: string; foreignAccountId: string; conversationId: string; script: Version; planning: Version; candidates: readonly [Version, Version] };
/** A persisted multi-Panel plan with two candidate clips bound to its first Shot. Records go through domain/native
 * setup plus the same draft-binding insert upload completion performs; never a product seed route.
 * Video upload stays disabled; candidates are published metadata, and playback is qualified separately. */
export async function prepareShotChoiceWork({ accountIds, native, servingUrl }: SavedWorkSetup): Promise<ShotChoiceWork> {
  const accountId = accountIds[0], foreignAccountId = accountIds[1];
  if (!accountId || !foreignAccountId || accountId === foreignAccountId) throw new Error('Distinct admitted fixture accounts required');
  const conversation = await createNativeConversation(native, accountId);
  const pool = new Pool({ connectionString: servingUrl, max: 2, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  try {
    const store = createArtifactStore(pool, createOwnedConversationCheck(native));
    const script = await store.insert({ accountId, conversationId: conversation.id, kind: 'script', createdBy: 'human', dependencies: [], content: { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'Ada waits beside the station clock.' }] }] }, use: { binding: { purpose: 'script' }, state: 'approved' } });
    const planning = await store.insert({ accountId, conversationId: conversation.id, kind: 'storyboard', createdBy: 'human', dependencies: [script.id], use: { binding: { purpose: 'storyboard' }, state: 'approved' }, content: { schemaVersion: 1, sourceScriptVersionId: script.id, shots: [
      { shotId: 'platform-shot', order: 0, intent: 'Ada waits on the platform.', panels: [
        { panelId: 'clock-panel', order: 0, description: 'Ada beneath the station clock.', references: [] },
        { panelId: 'track-panel', order: 1, description: 'Ada looks down the empty track.', references: [] },
      ] },
      { shotId: 'arrival-shot', order: 1, intent: 'The train arrives.', panels: [{ panelId: 'train-panel', order: 0, description: 'The train reaches the platform.', references: [] }] },
    ] } });
    // Two exact takes of one clip artifact, so the Shot offers Version 1 and Version 2.
    const clip = (artifactId?: string) => transaction(pool, client => publishVersion(client, { accountId, conversationId: conversation.id, kind: 'video', createdBy: 'human', dependencies: [], ...(artifactId ? { artifactId } : {}), media: { contentType: 'video/mp4', byteSize: 4096, width: 320, height: 180, durationMs: 2000, hasAudio: true } }));
    const take = await clip();
    const candidates = [take, await clip(take.artifactId)] as const;
    // Displayed candidates are draft Shot bindings; only an explicit human use chooses one.
    for (const version of candidates) await pool.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'shot_video','draft')", [accountId, conversation.id, randomUUID(), version.id, { purpose: 'shot_video', shotId: 'platform-shot' }]);
    return { accountId, foreignAccountId, conversationId: conversation.id, script, planning, candidates };
  } finally { await pool.end(); }
}
