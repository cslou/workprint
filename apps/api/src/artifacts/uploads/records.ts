import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { operations } from '@workprint/contracts';
import { transaction } from '../../db/index.js';
import { canonicalJson } from '../manual-content.js';
import { UploadError } from './errors.js';
import { lockUploadTarget, MAX_UPLOAD_ATTEMPTS, UPLOAD_LEASE_SECONDS, UPLOAD_LIFETIME_SECONDS } from './policy.js';
import type { UploadRequest, UploadResult, UploadRow } from './types.js';

export async function lockedUpload(client: PoolClient, account: string, id: string): Promise<UploadRow> {
  const row = (await client.query<UploadRow>('SELECT * FROM artifacts.uploads WHERE owner_id=$1 AND upload_id=$2 FOR UPDATE', [account, id])).rows[0];
  if (!row) throw new UploadError('not_found'); return row;
}
export function requireUploadLease(row: UploadRow, token: string): void {
  if (row.expires_at.getTime() <= Date.now()) throw new UploadError('not_found');
  if (row.state !== 'processing' || row.lease_token !== token || !row.lease_expires_at || row.lease_expires_at.getTime() <= Date.now()) throw new UploadError('integration_failure');
}

/** Upload persistence only. No storage/native collaborators run inside these SQL phases. */
export function uploadRecords(pool: Pool) {
  const load = async (account: string, id: string): Promise<UploadRow> => {
    const row = (await pool.query<UploadRow>('SELECT * FROM artifacts.uploads WHERE owner_id=$1 AND upload_id=$2', [account, id])).rows[0];
    if (!row) throw new UploadError('not_found'); return row;
  };
  const request = (account: string, conversation: string, body: UploadRequest, targetVersion: string | null) => transaction(pool, async client => {
    const payloadHash = createHash('sha256').update(canonicalJson(body)).digest('hex');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [canonicalJson(['request-upload', account, conversation, body.operationId])]);
    const existing = (await client.query<UploadRow>('SELECT * FROM artifacts.uploads WHERE owner_id=$1 AND conversation_id=$2 AND request_operation_id=$3', [account, conversation, body.operationId])).rows[0];
    if (existing) {
      if (existing.payload_hash !== payloadHash) throw new UploadError('invalid_input');
      if (existing.expires_at.getTime() <= Date.now()) throw new UploadError('not_found');
      return existing;
    }
    await lockUploadTarget(client, { owner_id: account, conversation_id: conversation, target_version_id: targetVersion });
    const id = randomUUID(), stagingKey = `staging/${id}/${randomUUID()}`, issuedAt = new Date(Math.floor(Date.now() / 1000) * 1000), expiresAt = new Date(issuedAt.getTime() + UPLOAD_LIFETIME_SECONDS * 1000);
    const row = (await client.query<UploadRow>(`INSERT INTO artifacts.uploads(owner_id,upload_id,conversation_id,request_operation_id,payload_hash,kind,content_type,byte_size,intended_use,target_version_id,staging_key,issued_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [account, id, conversation, body.operationId, payloadHash, body.kind, body.contentType, body.byteSize, body.intendedUse ?? null, targetVersion, stagingKey, issuedAt, expiresAt])).rows[0]!;
    await client.query("INSERT INTO artifacts.upload_objects(owner_id,object_key,upload_id,purpose) VALUES($1,$2,$3,'staging')", [account, stagingKey, id]);
    return row;
  });
  const claim = (admitted: UploadRow, operation: string): Promise<{ row: UploadRow; token: string; result?: UploadResult }> => transaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [canonicalJson(['confirm-upload', admitted.owner_id, admitted.conversation_id, operation])]);
    const row = await lockedUpload(client, admitted.owner_id, admitted.upload_id);
    const prior = (await client.query<{ upload_id: string }>('SELECT upload_id FROM artifacts.upload_confirmations WHERE owner_id=$1 AND conversation_id=$2 AND operation_id=$3', [row.owner_id, row.conversation_id, operation])).rows[0];
    if (prior && prior.upload_id !== row.upload_id) throw new UploadError('invalid_input');
    if (row.state !== 'confirmed' && row.expires_at.getTime() <= Date.now()) throw new UploadError('not_found');
    if (!prior) await client.query('INSERT INTO artifacts.upload_confirmations(owner_id,conversation_id,operation_id,upload_id) VALUES($1,$2,$3,$4)', [row.owner_id, row.conversation_id, operation, row.upload_id]);
    if (row.state === 'confirmed') {
      const result = operations.confirmUpload.response.safeParse(row.confirmed_result);
      if (!result.success) throw new UploadError('integration_failure');
      return { row, token: '', result: result.data };
    }
    if ((row.lease_expires_at?.getTime() ?? 0) > Date.now() || (row.cleanup_expires_at?.getTime() ?? 0) > Date.now()) throw new UploadError('integration_failure');
    await lockUploadTarget(client, row);
    const token = randomUUID();
    const leased = (await client.query<UploadRow>(`UPDATE artifacts.uploads SET state='processing',lease_token=$3,lease_expires_at=clock_timestamp()+$4*interval '1 second'
      WHERE owner_id=$1 AND upload_id=$2 RETURNING *`, [row.owner_id, row.upload_id, token, UPLOAD_LEASE_SECONDS])).rows[0]!;
    return { row: leased, token };
  });
  const release = async (row: UploadRow, token: string): Promise<void> => {
    await pool.query("UPDATE artifacts.uploads SET state='pending',lease_token=NULL,lease_expires_at=NULL WHERE owner_id=$1 AND upload_id=$2 AND lease_token=$3 AND state='processing'", [row.owner_id, row.upload_id, token]);
  };
  const reserve = (admitted: UploadRow, token: string, poster: boolean) => transaction(pool, async client => {
    const row = await lockedUpload(client, admitted.owner_id, admitted.upload_id); requireUploadLease(row, token);
    if (row.attempt_count >= MAX_UPLOAD_ATTEMPTS) throw new UploadError('unsupported', 'Upload attempt limit reached');
    const key = `published/${row.upload_id}/${token}`, posterKey = poster ? `posters/${row.upload_id}/${token}` : undefined;
    await client.query("INSERT INTO artifacts.upload_objects(owner_id,object_key,upload_id,purpose) VALUES($1,$2,$3,'candidate')", [row.owner_id, key, row.upload_id]);
    if (posterKey) await client.query("INSERT INTO artifacts.upload_objects(owner_id,object_key,upload_id,purpose) VALUES($1,$2,$3,'poster')", [row.owner_id, posterKey, row.upload_id]);
    await client.query('UPDATE artifacts.uploads SET attempt_count=attempt_count+1 WHERE owner_id=$1 AND upload_id=$2', [row.owner_id, row.upload_id]);
    return { key, posterKey };
  });
  return { load, request, claim, release, reserve };
}
