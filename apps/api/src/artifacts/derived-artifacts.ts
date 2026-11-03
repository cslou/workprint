import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

type Query = Pick<PoolClient, 'query'>;

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
export async function movableUse(client: Query, account: string, conversation: string, artifactId: string, binding: Readonly<Record<string, string>>, lock: boolean): Promise<string | undefined> {
  return (await client.query<{ use_id: string }>(`SELECT u.use_id FROM artifacts.conversation_uses u
    WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.binding=$3::jsonb AND u.state='draft' AND u.version_owner_id=$1
      AND u.version_id=(SELECT version_id FROM artifacts.versions WHERE owner_id=$1 AND artifact_id=$4 ORDER BY revision DESC LIMIT 1)
    ORDER BY u.use_id LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [account, conversation, binding, artifactId])).rows[0]?.use_id;
}
