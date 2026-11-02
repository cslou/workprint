import type { Pool } from 'pg';
import type { parseContent } from './content.js';
import { ArtifactError } from './errors.js';
import { protectedMediaObjects } from './media-objects.js';

/** Exact versions were already origin-authorized; require protected verified image pointers. */
export async function requireReferenceMedia(pool: Pool, content: ReturnType<typeof parseContent>): Promise<void> {
  if (!('subject' in content) || content.references.length === 0) return;
  if (!await verifiedMedia(pool, content.references.map(reference => reference.versionId))) throw new ArtifactError('invalid_input');
}

/** Whether every one of these distinct media versions has its checked object stored. */
export async function verifiedMedia(pool: Pool, versionIds: readonly string[]): Promise<boolean> {
  return (await protectedMediaObjects(pool, versionIds)).length === versionIds.length;
}
