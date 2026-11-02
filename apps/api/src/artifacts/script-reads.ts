import { savedScriptContentSchema, scriptSubjects, type ScriptSubject } from '@workprint/contracts';
import type { PoolClient } from 'pg';

/** The subjects of the script the video uses now, read inside the caller's transaction; null when it has no script. */
export async function scriptSubjectsNow(client: Pick<PoolClient, 'query'>, account: string, conversation: string): Promise<ScriptSubject[] | null> {
  const script = (await client.query<{ content: unknown }>(`SELECT v.content FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
    WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.purpose='script'`, [account, conversation])).rows[0];
  return script ? scriptSubjects(savedScriptContentSchema.parse(script.content)) : null;
}
