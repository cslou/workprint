import type { Pool } from 'pg';
import type { parseContent } from './content.js';
import { ArtifactError } from './errors.js';
import { protectedMediaObjects } from './media-objects.js';

/** Exact versions were already origin-authorized; require protected verified image pointers. */
export async function requireReferenceMedia(pool: Pool, content: ReturnType<typeof parseContent>): Promise<void> {
  if (!('subject' in content) || content.references.length === 0) return;
  const ids = content.references.map(reference => reference.versionId);
  const rows = await protectedMediaObjects(pool, ids);
  if (rows.length !== ids.length) throw new ArtifactError('invalid_input');
}
