import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

import { useRoom } from './use-room.js';

type Query = Pick<PoolClient, 'query'>;
/** What a derived artifact's draft use binds to: a panel's image or a Shot's video. */
export type DerivedBinding = Readonly<{ purpose: 'panel_image'; shotId: string; panelId: string }> | Readonly<{ purpose: 'shot_video'; shotId: string }>;

/**
 * The id of an artifact the server derives from what it is for: a panel's own image (`panel`, from the video, Shot
 * and panel) or a Shot's own video (`shot`, from the video and Shot). It is never found through what a person chose
 * there, so a version a person "Use"s on a panel or Shot is never versioned by the assistant.
 */
export const derivedArtifactId = (prefix: 'panel' | 'shot', parts: readonly string[]) => createHash('sha256').update(`${prefix}:${JSON.stringify(parts)}`).digest('hex');

/** Creates a derived artifact's row the first time; its versions are then published under it. */
export async function ensureDerivedArtifact(client: Query, account: string, artifactId: string, kind: 'image' | 'video'): Promise<void> {
  await client.query('INSERT INTO artifacts.artifacts(owner_id,artifact_id,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [account, artifactId, kind]);
}

/**
 * The draft use with `binding` on the latest version of a derived artifact, which its next version moves. Undefined
 * when that version's use is approved (a person chose it) or there is none yet: the next version then needs a new use.
 */
export async function movableUse(client: Query, account: string, conversation: string, artifactId: string, binding: DerivedBinding, lock: boolean): Promise<string | undefined> {
  return (await client.query<{ use_id: string }>(`SELECT u.use_id FROM artifacts.conversation_uses u
    WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.binding=$3::jsonb AND u.state='draft' AND u.version_owner_id=$1
      AND u.version_id=(SELECT version_id FROM artifacts.versions WHERE owner_id=$1 AND artifact_id=$4 ORDER BY revision DESC LIMIT 1)
    ORDER BY u.use_id LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [account, conversation, binding, artifactId])).rows[0]?.use_id;
}

/** Whether a derived artifact's next version can be kept: it moves a draft use, or the video has room for a new one. */
export async function hasDerivedRoom(client: Query, account: string, conversation: string, artifactId: string, binding: DerivedBinding): Promise<boolean> {
  return Boolean(await movableUse(client, account, conversation, artifactId, binding, false)) || await useRoom(client, account, conversation) > 0;
}

/**
 * Binds a derived artifact's new version by the use rule: it moves `moved`, the draft use on the previous version, or
 * else gets a new draft use. A made version is a draft: technical success never grants approval, and a person's
 * choice stays as it is. Returns the use's id.
 */
export async function bindDerivedDraft(client: Query, account: string, conversation: string, versionId: string, binding: DerivedBinding, moved: string | undefined): Promise<string> {
  if (moved) {
    await client.query('UPDATE artifacts.conversation_uses SET version_id=$1 WHERE owner_id=$2 AND use_id=$3', [versionId, account, moved]);
    return moved;
  }
  const id = randomUUID();
  await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,$6,'draft')", [account, conversation, id, versionId, binding, binding.purpose]);
  return id;
}
