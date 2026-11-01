import type { Pool } from 'pg';
import type { parseContent } from './content.js';
import { ArtifactError } from './errors.js';

/** Exact versions were already origin-authorized; require protected verified image pointers. */
export async function requireReferenceMedia(pool: Pool, content: ReturnType<typeof parseContent>): Promise<void> {
  if (!('subject' in content) || content.references.length === 0) return;
  const ids = content.references.map(reference => reference.versionId);
  const rows = (await pool.query<{ version_id: string }>(`SELECT m.version_id FROM artifacts.media_objects m
    JOIN artifacts.upload_objects o ON o.owner_id=m.owner_id AND o.object_key=m.object_key AND o.protected_version_id=m.version_id
    WHERE m.version_id=ANY($1::text[])`, [ids])).rows;
  if (rows.length !== ids.length) throw new ArtifactError('invalid_input');
}
