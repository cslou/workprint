import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { clipUseSchema, idSchema, MAX_UPLOAD_VIDEO_BYTES, type Version } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import type { PrivateObjectStorage } from '../storage/index.js';
import { digest, requireUseRoom, withStoredObjects } from './generated-media.js';
import { usedImageVersions } from './workspace-images.js';
import { lockPublicationOwner, publishVersion } from './publication.js';
import { createArtifactStore } from './store.js';
import { UploadError, uploadError } from './uploads/errors.js';
import { measuredMedia, verifyWhenFree } from './uploads/media-verifier.js';
import type { MediaVerifier, OwnedCheck } from './uploads/types.js';

type VideoVersion = Extract<Version, { kind: 'image' | 'video' }> & { kind: 'video' };
/** `frames` are the exact saved images sent as the first and last frame, in order. */
export type GeneratedVideoInput = Readonly<{ bytes: Uint8Array; frames: readonly string[] }>;
export type GeneratedVideoSave = Readonly<{ version: VideoVersion; use: z.infer<typeof clipUseSchema> }>;
/** Work that must commit with the clip, inside its transaction (the job's success, from `application`). */
export type WithinSave = (client: PoolClient, version: VideoVersion) => Promise<unknown>;
export type GeneratedVideoCollaborators = Readonly<{
  storage?: PrivateObjectStorage | undefined; verifyMedia?: MediaVerifier | undefined;
  capacityWaitMs?: number; capacityRetryMs?: number;
}>;

const framesSchema = z.array(idSchema).max(2).refine(ids => new Set(ids).size === ids.length);
const binding = { purpose: 'video' } as const;

/**
 * The assistant's clip capability: it checks a provider's clip with the assistant allowance, stores it and its
 * poster privately and saves it as the video's draft clip, with its frames as dependencies.
 */
export function createGeneratedVideos(pool: Pool, checkOwnedConversation: OwnedCheck, collaborators: GeneratedVideoCollaborators) {
  const capacityWaitMs = collaborators.capacityWaitMs ?? 30_000, capacityRetryMs = collaborators.capacityRetryMs ?? 250;
  const reads = createArtifactStore(pool, checkOwnedConversation);

  return Object.freeze({
    async save(account: string, conversation: string, input: GeneratedVideoInput, options: Readonly<{ signal?: AbortSignal | undefined; within?: WithinSave | undefined }> = {}): Promise<GeneratedVideoSave> {
      try {
        if (!idSchema.safeParse(account).success || !idSchema.safeParse(conversation).success) throw new UploadError('invalid_input');
        if (!framesSchema.safeParse(input.frames).success) throw new UploadError('not_found');
        if (!(input.bytes instanceof Uint8Array) || !input.bytes.byteLength || input.bytes.byteLength > MAX_UPLOAD_VIDEO_BYTES) throw new UploadError('unsupported');
        const { storage, verifyMedia } = collaborators;
        if (!storage || !verifyMedia) throw new UploadError('not_implemented', 'Private storage or media checks are not available');
        // Ownership is checked by the workspace read; each frame must be an image this video uses.
        const used = usedImageVersions(await reads.workspace(account, conversation));
        if (input.frames.some(id => !used.has(id))) throw new UploadError('not_found');
        const bytes = Buffer.from(input.bytes);
        const verified = await verifyWhenFree(verifyMedia, { kind: 'video', bytes, contentType: 'video/mp4', origin: 'assistant' }, { waitMs: capacityWaitMs, retryMs: capacityRetryMs, signal: options.signal });
        const media = measuredMedia({ kind: 'video', contentType: 'video/mp4', byteSize: bytes.length }, verified);
        if (!verified.poster) throw new UploadError('integration_failure');
        const poster = { bytes: Buffer.from(verified.poster.bytes), contentType: verified.poster.contentType };
        const id = randomUUID(), key = `published/${id}/${id}`, posterKey = `posters/${id}/${id}`;
        // A stopped run stores nothing after its check.
        options.signal?.throwIfAborted();
        return await withStoredObjects(storage, [{ key, bytes, contentType: 'video/mp4' }, { key: posterKey, ...poster }], () => transaction(pool, async client => {
          await lockPublicationOwner(client, account);
          await requireUseRoom(client, account, conversation);
          const version = await publishVersion(client, { accountId: account, conversationId: conversation, kind: 'video', media, dependencies: input.frames, createdBy: 'assistant' });
          if (version.kind !== 'video') throw new UploadError('integration_failure');
          const clip = { ...version, kind: 'video' as const };
          const insertObject = 'INSERT INTO artifacts.generated_objects(owner_id,object_key,version_id,sha256,byte_size,content_type) VALUES($1,$2,$3,$4,$5,$6)';
          await client.query(insertObject, [account, key, version.id, digest(bytes), bytes.length, 'video/mp4']);
          await client.query(insertObject, [account, posterKey, version.id, digest(poster.bytes), poster.bytes.length, poster.contentType]);
          await client.query('INSERT INTO artifacts.media_objects(owner_id,version_id,generated_key,generated_poster_key,sha256) VALUES($1,$2,$3,$4,$5)', [account, version.id, key, posterKey, digest(bytes)]);
          // A made clip is a draft: technical success never grants approval.
          const use = clipUseSchema.parse({ id: randomUUID(), versionId: version.id, binding, state: 'draft' });
          await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'video','draft')", [account, conversation, use.id, version.id, binding]);
          await options.within?.(client, clip);
          return { version: clip, use };
        }), 'Generated video');
      } catch (error) {
        if (error instanceof AggregateError) throw error;
        throw uploadError(error);
      }
    },
  });
}
export type GeneratedVideos = ReturnType<typeof createGeneratedVideos>;
