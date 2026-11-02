import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { idSchema, MAX_UPLOAD_IMAGE_BYTES, useSchema, type Version } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import type { PrivateObjectStorage } from '../storage/index.js';
import { digest, requireUseRoom, withStoredObjects } from './generated-media.js';
import { protectedMediaObjects } from './media-objects.js';
import { lockPublicationOwner, publishVersion } from './publication.js';
import { BUILT_IN_OWNER, createArtifactStore } from './store.js';
import { UploadError, uploadError } from './uploads/errors.js';
import { measuredMedia, verifyWhenFree } from './uploads/media-verifier.js';
import type { MediaVerifier, OwnedCheck } from './uploads/types.js';

/** `revises`, one of `inputs`, names the image this one changes: it is saved as that image's next version. */
export type GeneratedImageInput = Readonly<{ bytes: Uint8Array; contentType: string; inputs: readonly string[]; revises?: string | undefined }>;
export type GeneratedImageSave = Readonly<{ version: Extract<Version, { kind: 'image' | 'video' }>; use: z.infer<typeof useSchema> }>;
/** One saved image's exact bytes, checked against its record, with its saved size. */
export type StoredImage = Readonly<{ versionId: string; contentType: string; bytes: Buffer; width: number; height: number }>;
export type GeneratedImageCollaborators = Readonly<{
  /** Like uploads, only backend composition supplies these; without them saves and reads are unavailable. */
  storage?: PrivateObjectStorage | undefined; verifyMedia?: MediaVerifier | undefined;
  /** How long a busy media checker is waited out, and how long between tries. */
  capacityWaitMs?: number; capacityRetryMs?: number;
}>;

const inputsSchema = z.array(idSchema).max(10).refine(ids => new Set(ids).size === ids.length);
const binding = { purpose: 'reference' } as const;

/**
 * The assistant's image capability: it checks assistant-made bytes as strictly as uploads, stores them privately
 * and saves them as the video's draft images. Saved images, uploaded or made, can be read back as exact bytes.
 */
export function createGeneratedImages(pool: Pool, checkOwnedConversation: OwnedCheck, collaborators: GeneratedImageCollaborators) {
  const required = () => {
    if (!collaborators.storage || !collaborators.verifyMedia) throw new UploadError('not_implemented', 'Private storage or media checks are not available');
    return { storage: collaborators.storage, verifyMedia: collaborators.verifyMedia };
  };
  const capacityWaitMs = collaborators.capacityWaitMs ?? 30_000, capacityRetryMs = collaborators.capacityRetryMs ?? 250;
  const reads = createArtifactStore(pool, checkOwnedConversation);

  const verify = (verifyMedia: MediaVerifier, input: GeneratedImageInput, signal: AbortSignal | undefined) =>
    verifyWhenFree(verifyMedia, { kind: 'image', bytes: input.bytes, contentType: input.contentType, origin: 'assistant' }, { waitMs: capacityWaitMs, retryMs: capacityRetryMs, signal });

  return Object.freeze({
    async save(account: string, conversation: string, input: GeneratedImageInput, signal?: AbortSignal): Promise<GeneratedImageSave> {
      try {
        if (!idSchema.safeParse(account).success || !idSchema.safeParse(conversation).success) throw new UploadError('invalid_input');
        // Inputs that aren't distinct ids can't name saved images.
        if (!inputsSchema.safeParse(input.inputs).success) throw new UploadError('not_found');
        if (!(input.bytes instanceof Uint8Array) || !input.bytes.byteLength || input.bytes.byteLength > MAX_UPLOAD_IMAGE_BYTES) throw new UploadError('unsupported');
        const { storage, verifyMedia } = required();
        const owned = await checkOwnedConversation(account, conversation);
        if (owned.kind !== 'owned') throw new UploadError(owned.kind === 'not_found' ? 'not_found' : 'integration_failure');
        // Each input must be an image this account can read, before anything is stored.
        for (const id of input.inputs) if ((await reads.version(account, id)).kind !== 'image') throw new UploadError('not_found');
        const bytes = Buffer.from(input.bytes);
        const media = measuredMedia({ kind: 'image', contentType: input.contentType, byteSize: bytes.length }, await verify(verifyMedia, { ...input, bytes }, signal));
        const id = randomUUID(), key = `published/${id}/${id}`, sha256 = digest(bytes);
        // A stopped run stores nothing after its check.
        signal?.throwIfAborted();
        return await withStoredObjects(storage, [{ key, bytes, contentType: input.contentType }], () => transaction(pool, async client => {
            await lockPublicationOwner(client, account);
            // An edit of one of this video's own images is that image's next version, in the same place in the video.
            // A built-in image, or one the video doesn't use as an image, can't be revised: the edit is a new image.
            // So is an approved one: a person's approval is never replaced by an assistant draft.
            const revised = input.revises && input.inputs.includes(input.revises) ? (await client.query<{ use_id: string; artifact_id: string }>(`SELECT u.use_id,v.artifact_id
              FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
              JOIN artifacts.versions r ON r.owner_id=$1 AND r.version_id=$3 AND r.artifact_id=v.artifact_id
              WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.purpose='reference' AND u.state='draft' AND u.version_owner_id=$1 AND v.kind='image'
              ORDER BY u.created_at,u.use_id LIMIT 1 FOR UPDATE OF u`, [account, conversation, input.revises])).rows[0] : undefined;
            if (!revised) await requireUseRoom(client, account, conversation);
            // No base check: edits made at once land as successive versions, and none is lost.
            const version = await publishVersion(client, { accountId: account, conversationId: conversation, artifactId: revised?.artifact_id, kind: 'image', media, dependencies: input.inputs, createdBy: 'assistant' });
            if (version.kind !== 'image') throw new UploadError('integration_failure');
            await client.query('INSERT INTO artifacts.generated_objects(owner_id,object_key,version_id,sha256,byte_size,content_type) VALUES($1,$2,$3,$4,$5,$6)', [account, key, version.id, sha256, bytes.length, input.contentType]);
            await client.query('INSERT INTO artifacts.media_objects(owner_id,version_id,generated_key,sha256) VALUES($1,$2,$3,$4)', [account, version.id, key, sha256]);
            // A made image is a draft: technical success never grants approval.
            const use = useSchema.parse({ id: revised?.use_id ?? randomUUID(), versionId: version.id, binding, state: 'draft' });
            if (revised) await client.query("UPDATE artifacts.conversation_uses SET version_id=$1,state='draft' WHERE owner_id=$2 AND use_id=$3", [version.id, account, use.id]);
            else await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'reference','draft')", [account, conversation, use.id, version.id, binding]);
            return { version, use };
          }), 'Generated image');
      } catch (error) {
        if (error instanceof AggregateError) throw error;
        throw uploadError(error);
      }
    },

    /** The exact stored bytes of an image version this account can read; the caller decides which uses allow it. */
    async read(account: string, versionId: string): Promise<StoredImage> {
      try {
        const { storage } = required();
        const version = await reads.version(account, versionId);
        if (version.kind !== 'image') throw new UploadError('not_found');
        const [object] = await protectedMediaObjects(pool, [versionId], version.builtIn ? BUILT_IN_OWNER : account);
        if (!object) throw new UploadError('not_found');
        const stored = await storage.read(object.objectKey, Math.min(version.media.byteSize, MAX_UPLOAD_IMAGE_BYTES));
        // The bytes must be the ones that were checked and saved, not whatever the object holds now.
        if (stored.byteSize !== version.media.byteSize || digest(stored.bytes) !== object.sha256) throw new UploadError('integration_failure');
        return { versionId, contentType: version.media.contentType, bytes: stored.bytes, width: version.media.width, height: version.media.height };
      } catch (error) { throw uploadError(error); }
    },
  });
}
export type GeneratedImages = ReturnType<typeof createGeneratedImages>;
