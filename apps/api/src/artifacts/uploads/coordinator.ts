import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { idSchema, operations } from '@workprint/contracts';
import { createArtifactStore } from '../store.js';
import { MAX_OBJECT_BYTES } from '../../storage/index.js';
import { authorizeUpload, parseUploadRequest, requireImageUpload, uploadTarget } from './policy.js';
import { UploadError, uploadError } from './errors.js';
import { uploadRecords } from './records.js';
import { completeUpload } from './completion.js';
import { cleanupUpload } from './cleanup.js';
import { createMediaAccess } from './access.js';
import { measuredMedia, verifyWhenFree } from './media-verifier.js';
import type { OwnedCheck, UploadCollaborators, UploadRequest, VerifiedMedia } from './types.js';

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** One request owns its work; only backend composition may supply a real verifier. */
export function createUploadCoordinator(pool: Pool, checkOwnedConversation: OwnedCheck, collaborators: UploadCollaborators = {}) {
  const records = uploadRecords(pool), reads = createArtifactStore(pool, checkOwnedConversation);
  let active = 0;
  const ownedUpload = async (account: string, id: string) => {
    if (!idSchema.safeParse(account).success || !idSchema.safeParse(id).success) throw new UploadError('invalid_input');
    const row = await records.load(account, id); await authorizeUpload(checkOwnedConversation, account, row.conversation_id);
    if (row.target_version_id) await reads.version(account, row.target_version_id);
    return row;
  };
  return Object.freeze({
    media: createMediaAccess(pool, reads, collaborators.storage),
    request: async (account: string, conversation: string, body: UploadRequest) => {
      try {
        await authorizeUpload(checkOwnedConversation, account, conversation);
        const input = parseUploadRequest(conversation, body);
        if (!collaborators.storage) throw new UploadError('not_implemented', 'Private storage is not available');
        const target = await uploadTarget(reads, account, conversation, input.intendedUse);
        const row = await records.request(account, conversation, input, target);
        const url = await collaborators.storage.presignPut({ key: row.staging_key, byteSize: Number(row.byte_size), contentType: row.content_type, issuedAt: row.issued_at, expiresAt: row.expires_at });
        return operations.requestUpload.response.parse({ uploadId: row.upload_id, url, expiresAt: row.expires_at.toISOString(), maxBytes: Number(row.byte_size) });
      } catch (error) { throw uploadError(error); }
    },
    confirm: async (account: string, id: string, operation: string) => {
      if (!idSchema.safeParse(operation).success) throw new UploadError('invalid_input');
      const admitted = await ownedUpload(account, id);
      requireImageUpload(admitted.kind);
      const claimed = await records.claim(admitted, operation);
      if (claimed.result) return claimed.result;
      const { row, token } = claimed;
      let capacity = false, quarantined = false;
      try {
        if (!collaborators.storage || active >= 2) throw new UploadError('integration_failure');
        active++; capacity = true;
        const snapshot = await collaborators.storage.read(row.staging_key, Math.min(Number(row.byte_size), MAX_OBJECT_BYTES));
        if (snapshot.byteSize !== Number(row.byte_size) || snapshot.contentType !== row.content_type || digest(snapshot.bytes) !== snapshot.sha256) throw new UploadError('invalid_input');
        if (!collaborators.verifyMedia) throw new UploadError('not_implemented');
        const controller = new AbortController();
        // An assistant image check holding the one-job checker is waited out, inside this confirm's own limit.
        const verification = Promise.resolve().then(() => verifyWhenFree(collaborators.verifyMedia!, { kind: row.kind, bytes: new Uint8Array(snapshot.bytes), contentType: row.content_type }, { waitMs: 15_000, retryMs: 250, signal: controller.signal }));
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new UploadError('integration_failure')); }, 20000); });
        let verified: VerifiedMedia;
        try { verified = await Promise.race([verification, timeout]); }
        catch (error) {
          if (controller.signal.aborted) {
            // Noncooperative inspection cannot create an unbounded abandoned-work queue.
            quarantined = true; void verification.then(() => { active--; }, () => { active--; });
          }
          throw uploadError(error);
        } finally { if (timer) clearTimeout(timer); }
        const media = measuredMedia({ kind: row.kind, contentType: row.content_type, byteSize: Number(row.byte_size) }, verified);
        const poster = verified.poster ? { bytes: Buffer.from(verified.poster.bytes), contentType: verified.poster.contentType } : undefined;
        const expectedPosterHash = poster ? digest(poster.bytes) : undefined;
        const reserved = await records.reserve(row, token, !!poster);
        const object = await collaborators.storage.publish(reserved.key, snapshot.bytes, row.content_type);
        if (object.sha256 !== snapshot.sha256 || object.byteSize !== snapshot.byteSize) throw new UploadError('integration_failure');
        let posterSha256: string | undefined;
        if (poster && reserved.posterKey) {
          const publishedPoster = await collaborators.storage.publish(reserved.posterKey, poster.bytes, poster.contentType);
          if (publishedPoster.sha256 !== expectedPosterHash || publishedPoster.byteSize !== poster.bytes.length) throw new UploadError('integration_failure');
          posterSha256 = publishedPoster.sha256;
        }
        return await completeUpload(pool, row, token, { key: reserved.key, sha256: snapshot.sha256, media, ...(reserved.posterKey && posterSha256 ? { posterKey: reserved.posterKey, posterSha256 } : {}) });
      } catch (error) {
        try { await records.release(row, token); }
        catch (releaseError) { throw new AggregateError([uploadError(error), uploadError(releaseError)], 'Upload settlement failed', { cause: releaseError }); }
        throw uploadError(error);
      } finally { if (capacity && !quarantined) active--; }
    },
    cleanup: async (account: string, id: string) => {
      const row = await ownedUpload(account, id);
      if (!collaborators.storage) throw new UploadError('integration_failure');
      try { return await cleanupUpload(pool, collaborators.storage, row); }
      catch (error) { throw uploadError(error); }
    },
  });
}
export type UploadCoordinator = ReturnType<typeof createUploadCoordinator>;
