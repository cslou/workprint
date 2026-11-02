import { savedScriptContentSchema, scriptSubjects, type ScriptSubject } from '@workprint/contracts';
import type { PoolClient } from 'pg';
import type { z } from 'zod';

/** The script the video uses now, read inside the caller's transaction: its exact version and parsed content. */
export type ScriptNow = Readonly<{ versionId: string; script: z.infer<typeof savedScriptContentSchema> }>;

/** The script the video uses now; null when it has no script. */
export async function scriptNow(client: Pick<PoolClient, 'query'>, account: string, conversation: string): Promise<ScriptNow | null> {
  const row = (await client.query<{ version_id: string; content: unknown }>(`SELECT u.version_id,v.content FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
    WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.purpose='script'`, [account, conversation])).rows[0];
  return row ? { versionId: row.version_id, script: savedScriptContentSchema.parse(row.content) } : null;
}

/** The subjects of the script the video uses now, read inside the caller's transaction; null when it has no script. */
export async function scriptSubjectsNow(client: Pick<PoolClient, 'query'>, account: string, conversation: string): Promise<ScriptSubject[] | null> {
  const now = await scriptNow(client, account, conversation);
  return now ? scriptSubjects(now.script) : null;
}
