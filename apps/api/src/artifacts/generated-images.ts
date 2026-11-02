import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { idSchema, MAX_UPLOAD_IMAGE_BYTES, useSchema, type Version } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import { MediaProcessError, type PrivateObjectStorage } from '../storage/index.js';
import { protectedMediaObjects } from './media-objects.js';
import { lockPublicationOwner, publishVersion } from './publication.js';
import { BUILT_IN_OWNER, createArtifactStore } from './store.js';
import { UploadError, uploadError } from './uploads/errors.js';
import { measuredMedia } from './uploads/media-verifier.js';
import type { MediaVerifier, OwnedCheck } from './uploads/types.js';

export type GeneratedImageInput = Readonly<{ bytes: Uint8Array; contentType: string; inputs: readonly string[] }>;
export type GeneratedImageSave = Readonly<{ version: Extract<Version, { kind: 'image' | 'video' }>; use: z.infer<typeof useSchema> }>;
/** One saved image's exact bytes, checked against its record. */
export type StoredImage = Readonly<{ versionId: string; contentType: string; bytes: Buffer }>;
export type GeneratedImageCollaborators = Readonly<{
  storage: PrivateObjectStorage; verifyMedia: MediaVerifier;
  /** How long a busy media checker is waited out, and how long between tries. */
  capacityWaitMs?: number; capacityRetryMs?: number;
}>;

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const inputsSchema = z.array(idSchema).max(10).refine(ids => new Set(ids).size === ids.length);
const binding = { purpose: 'reference' } as const;
const busy = (error: unknown) => error instanceof MediaProcessError && error.code === 'capacity';

/**
 * The assistant's image capability: it checks assistant-made bytes as strictly as uploads, stores them privately
 * and saves them as the video's draft images. Saved images, uploaded or made, can be read back as exact bytes.
 */
export function createGeneratedImages(pool: Pool, checkOwnedConversation: OwnedCheck, collaborators: GeneratedImageCollaborators) {
  const { storage, verifyMedia } = collaborators;
  const capacityWaitMs = collaborators.capacityWaitMs ?? 30_000, capacityRetryMs = collaborators.capacityRetryMs ?? 250;
  const reads = createArtifactStore(pool, checkOwnedConversation);

  /** The checker runs one job at a time; another job's turn is waited out, within a bound. */
  const verify = async (input: GeneratedImageInput, signal: AbortSignal | undefined) => {
    const deadline = Date.now() + capacityWaitMs;
    for (;;) {
      try {
        const attempt = AbortSignal.timeout(20_000);
        return await verifyMedia({ kind: 'image', bytes: input.bytes, contentType: input.contentType, origin: 'assistant', signal: signal ? AbortSignal.any([signal, attempt]) : attempt });
      } catch (error) {
        if (!busy(error) || Date.now() + capacityRetryMs > deadline || signal?.aborted) throw error;
        await new Promise(resolve => setTimeout(resolve, capacityRetryMs));
      }
    }
  };

  return Object.freeze({
    async save(account: string, conversation: string, input: GeneratedImageInput, signal?: AbortSignal): Promise<GeneratedImageSave> {
      try {
        if (!idSchema.safeParse(account).success || !idSchema.safeParse(conversation).success) throw new UploadError('invalid_input');
        // Inputs that aren't distinct ids can't name saved images.
        if (!inputsSchema.safeParse(input.inputs).success) throw new UploadError('not_found');
        if (!(input.bytes instanceof Uint8Array) || !input.bytes.byteLength || input.bytes.byteLength > MAX_UPLOAD_IMAGE_BYTES) throw new UploadError('unsupported');
        const owned = await checkOwnedConversation(account, conversation);
        if (owned.kind !== 'owned') throw new UploadError(owned.kind === 'not_found' ? 'not_found' : 'integration_failure');
        // Each input must be an image this account can read, before anything is stored.
        for (const id of input.inputs) if ((await reads.version(account, id)).kind !== 'image') throw new UploadError('not_found');
        const bytes = Buffer.from(input.bytes);
        const media = measuredMedia({ kind: 'image', contentType: input.contentType, byteSize: bytes.length }, await verify({ ...input, bytes }, signal));
        const id = randomUUID(), key = `published/${id}/${id}`, sha256 = digest(bytes);
        // A stopped run stores nothing after its check.
        signal?.throwIfAborted();
        const object = await storage.publish(key, bytes, input.contentType);
        try {
          if (object.sha256 !== sha256 || object.byteSize !== bytes.length) throw new UploadError('integration_failure');
          return await transaction(pool, async client => {
            await lockPublicationOwner(client, account);
            const count = (await client.query<{ count: number }>('SELECT count(*)::int AS count FROM artifacts.conversation_uses WHERE owner_id=$1 AND conversation_id=$2', [account, conversation])).rows[0]!.count;
            if (count >= 100) throw new UploadError('integration_failure');
            const version = await publishVersion(client, { accountId: account, conversationId: conversation, kind: 'image', media, dependencies: input.inputs, createdBy: 'assistant' });
            if (version.kind !== 'image') throw new UploadError('integration_failure');
            await client.query('INSERT INTO artifacts.generated_objects(owner_id,object_key,version_id,sha256,byte_size,content_type) VALUES($1,$2,$3,$4,$5,$6)', [account, key, version.id, sha256, bytes.length, input.contentType]);
            await client.query('INSERT INTO artifacts.media_objects(owner_id,version_id,generated_key,sha256) VALUES($1,$2,$3,$4)', [account, version.id, key, sha256]);
            // A made image is a draft: technical success never grants approval.
            const use = useSchema.parse({ id: randomUUID(), versionId: version.id, binding, state: 'draft' });
            await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'reference','draft')", [account, conversation, use.id, version.id, binding]);
            return { version, use };
          });
        } catch (error) {
          // Nothing saved points at the object, so it never outlives the failed save.
          try { await storage.remove(key); }
          catch (removeError) { throw new AggregateError([uploadError(error), uploadError(removeError)], 'Generated image cleanup failed', { cause: removeError }); }
          throw error;
        }
      } catch (error) {
        if (error instanceof AggregateError) throw error;
        throw uploadError(error);
      }
    },

    /** The exact stored bytes of an image version this account can read; the caller decides which uses allow it. */
    async read(account: string, versionId: string): Promise<StoredImage> {
      try {
        const version = await reads.version(account, versionId);
        if (version.kind !== 'image') throw new UploadError('not_found');
        const [object] = await protectedMediaObjects(pool, [versionId], version.builtIn ? BUILT_IN_OWNER : account);
        if (!object) throw new UploadError('not_found');
        const stored = await storage.read(object.objectKey, Math.min(version.media.byteSize, MAX_UPLOAD_IMAGE_BYTES));
        // The bytes must be the ones that were checked and saved, not whatever the object holds now.
        if (stored.byteSize !== version.media.byteSize || digest(stored.bytes) !== object.sha256) throw new UploadError('integration_failure');
        return { versionId, contentType: version.media.contentType, bytes: stored.bytes };
      } catch (error) { throw uploadError(error); }
    },
  });
}
export type GeneratedImages = ReturnType<typeof createGeneratedImages>;
