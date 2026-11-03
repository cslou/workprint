import type { PoolClient } from 'pg';
import type { z } from 'zod';
import { savedReferenceContentSchema } from '@workprint/contracts';

type SheetRow = { use_id: string; version_id: string; version_owner_id: string; artifact_id: string; binding: unknown; content: unknown; dependencies: string[] };
/** A current sheet: the reference use, its version's dependencies and its parsed content. */
export type Sheet = SheetRow & { sheet: z.infer<typeof savedReferenceContentSchema> };

/** The video's current sheets in workspace order, each with its parsed content, locked for the caller's transaction. */
export async function currentSheets(client: Pick<PoolClient, 'query'>, account: string, conversation: string): Promise<Sheet[]> {
  const rows = (await client.query<SheetRow>(`SELECT u.use_id,u.version_id,u.version_owner_id,v.artifact_id,u.binding,v.content,
      COALESCE((SELECT array_agg(d.dependency_id ORDER BY d.position) FROM artifacts.version_dependencies d WHERE d.owner_id=v.owner_id AND d.version_id=v.version_id),ARRAY[]::text[]) AS dependencies
    FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
    WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.purpose='reference' AND v.kind='reference' ORDER BY u.created_at,u.use_id FOR UPDATE OF u`, [account, conversation])).rows;
  return rows.flatMap(row => { const sheet = savedReferenceContentSchema.safeParse(row.content); return sheet.success ? [{ ...row, sheet: sheet.data }] : []; });
}
