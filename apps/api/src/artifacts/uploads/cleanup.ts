import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { PrivateObjectStorage } from '../../storage/index.js';
import { transaction } from '../../db/index.js';
import { UploadError } from './errors.js';
import { lockedUpload } from './records.js';
import type { UploadRow } from './types.js';

/** Explicit bounded cleanup, never a scheduler or Artifact deletion. References are tombstones. */
export async function cleanupUpload(pool: Pool, storage: PrivateObjectStorage, admitted: UploadRow) {
  const token = randomUUID();
  const rows = await transaction(pool, async client => {
    const row = await lockedUpload(client, admitted.owner_id, admitted.upload_id);
    if ((row.lease_expires_at?.getTime() ?? 0) > Date.now() || (row.cleanup_expires_at?.getTime() ?? 0) > Date.now()) throw new UploadError('integration_failure');
    await client.query("UPDATE artifacts.uploads SET cleanup_token=$3,cleanup_expires_at=clock_timestamp()+interval '60 seconds' WHERE owner_id=$1 AND upload_id=$2", [row.owner_id, row.upload_id, token]);
    return (await client.query<{ object_key: string }>(`SELECT o.object_key FROM artifacts.upload_objects o WHERE o.owner_id=$1 AND o.upload_id=$2 AND o.protected_version_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM artifacts.media_objects m WHERE m.owner_id=o.owner_id AND (m.object_key=o.object_key OR m.poster_key=o.object_key))
      ORDER BY o.last_cleanup_at NULLS FIRST,o.object_key LIMIT 4`, [row.owner_id, row.upload_id])).rows;
  });
  let succeeded = 0, failed = 0;
  try {
    for (let index = 0; index < rows.length; index += 2) {
      const batch = rows.slice(index, index + 2);
      const results = await Promise.allSettled(batch.map(row => storage.remove(row.object_key)));
      for (const [position, result] of results.entries()) {
        if (result.status === 'fulfilled') succeeded++; else failed++;
        await pool.query(`UPDATE artifacts.upload_objects SET last_cleanup_at=clock_timestamp(),cleanup_failures=cleanup_failures+$3
          WHERE owner_id=$1 AND object_key=$2 AND protected_version_id IS NULL`, [admitted.owner_id, batch[position]!.object_key, result.status === 'rejected' ? 1 : 0]);
      }
    }
  } finally {
    await pool.query('UPDATE artifacts.uploads SET cleanup_token=NULL,cleanup_expires_at=NULL WHERE owner_id=$1 AND upload_id=$2 AND cleanup_token=$3', [admitted.owner_id, admitted.upload_id, token]);
  }
  // Even successful deletion cannot revoke an issued PUT or rule out late completion.
  if (failed) throw new UploadError('integration_failure', 'Upload cleanup incomplete; references retained');
  return { attempted: rows.length, succeeded };
}
