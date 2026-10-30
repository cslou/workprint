import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { operations, useSchema } from '@workprint/contracts';
import { transaction } from '../../db/index.js';
import { lockPublicationOwner, publishVersion } from '../publication.js';
import { UploadError } from './errors.js';
import { lockUploadTarget } from './policy.js';
import { lockedUpload, requireUploadLease } from './records.js';
import type { MediaVersion, UploadResult, UploadRow } from './types.js';

type Publication = { key: string; sha256: string; media: MediaVersion['media']; posterKey?: string; posterSha256?: string };
/** Atomic visibility only; all verification and object I/O have already finished outside SQL. */
export function completeUpload(pool: Pool, admitted: UploadRow, token: string, publication: Publication): Promise<UploadResult> {
  return transaction(pool, async client => {
    await lockPublicationOwner(client, admitted.owner_id);
    const row = await lockedUpload(client, admitted.owner_id, admitted.upload_id); requireUploadLease(row, token);
    await lockUploadTarget(client, row);
    const keys = [publication.key, ...(publication.posterKey ? [publication.posterKey] : [])];
    const reserved = (await client.query<{ object_key: string }>('SELECT object_key FROM artifacts.upload_objects WHERE owner_id=$1 AND upload_id=$2 AND object_key=ANY($3::text[]) AND protected_version_id IS NULL FOR UPDATE', [row.owner_id, row.upload_id, keys])).rows;
    if (reserved.length !== keys.length || publication.key !== `published/${row.upload_id}/${token}` || (publication.posterKey && publication.posterKey !== `posters/${row.upload_id}/${token}`)) throw new UploadError('integration_failure');
    const version = await publishVersion(client, { accountId: row.owner_id, conversationId: row.conversation_id, kind: row.kind, media: publication.media, dependencies: row.target_version_id ? [row.target_version_id] : [], createdBy: 'human' });
    await client.query('INSERT INTO artifacts.media_objects(owner_id,version_id,object_key,poster_key,sha256,poster_sha256) VALUES($1,$2,$3,$4,$5,$6)', [row.owner_id, version.id, publication.key, publication.posterKey ?? null, publication.sha256, publication.posterSha256 ?? null]);
    await client.query('UPDATE artifacts.upload_objects SET protected_version_id=$3 WHERE owner_id=$1 AND object_key=ANY($2::text[])', [row.owner_id, keys, version.id]);
    let use;
    if (row.intended_use) {
      // Import linkage is draft: technical verification never grants approval or a Shot choice.
      use = useSchema.parse({ id: randomUUID(), versionId: version.id, binding: row.intended_use, state: 'draft' });
      await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,$6,'draft')", [row.owner_id, row.conversation_id, use.id, version.id, use.binding, use.binding.purpose]);
    }
    const result = operations.confirmUpload.response.parse({ version, ...(use ? { use } : {}) });
    await client.query("UPDATE artifacts.uploads SET state='confirmed',confirmed_result=$3,lease_token=NULL,lease_expires_at=NULL WHERE owner_id=$1 AND upload_id=$2", [row.owner_id, row.upload_id, result]);
    return result;
  });
}
