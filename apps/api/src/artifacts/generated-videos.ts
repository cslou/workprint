import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { clipUseSchema, idSchema, MAX_UPLOAD_VIDEO_BYTES, useSchema, type Version } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import { MEDIA_JOIN_CLIPS, MEDIA_JOB_BYTES, type PrivateObjectStorage } from '../storage/index.js';
import { bindDerivedDraft, derivedArtifactId, ensureDerivedArtifact, hasDerivedRoom, movableUse, type DerivedBinding } from './derived-artifacts.js';
import { digest, readCheckedMedia, requireOwnedConversation, requireUseRoom, withStoredObjects } from './generated-media.js';
import { hasTarget, usedPlan } from './panel-targets.js';
import { usedImageVersions, usedVideoVersions } from './workspace-images.js';
import { lockPublicationOwner, publishVersion } from './publication.js';
import { BUILT_IN_OWNER, createArtifactStore } from './store.js';
import { UploadError, uploadError } from './uploads/errors.js';
import { measuredMedia, sandboxTurn, verifyWhenFree } from './uploads/media-verifier.js';
import type { MediaVerifier, OwnedCheck } from './uploads/types.js';
import { requireRoom, UseRoomError } from './use-room.js';

type VideoVersion = Extract<Version, { kind: 'image' | 'video' }> & { kind: 'video' };
/** A storyboard Shot a clip was made for. */
export type ShotTarget = Readonly<{ shotId: string }>;
/**
 * Clips joined into one, in order, and the length of one of their frames: the joined video's length must be theirs
 * added up, within a frame.
 */
export type JoinedClips = Readonly<{ clips: readonly string[]; frameMs: number }>;
/**
 * `frames` are the exact saved images sent as the first and last frame, in order. `target`: the Shot the clip is for.
 * `joined`: the clips this video was joined from, which become its dependencies; it then has no frames or target.
 */
export type GeneratedVideoInput = Readonly<{ bytes: Uint8Array; frames: readonly string[]; target?: ShotTarget | undefined; joined?: JoinedClips | undefined }>;
/** How many clips one join takes, and the most bytes they may hold together (the media sandbox's job limit). */
export const joinableClips = Object.freeze({ min: MEDIA_JOIN_CLIPS.min, max: MEDIA_JOIN_CLIPS.max, maxBytes: MEDIA_JOB_BYTES });
/** The exact stored bytes of a video version and its saved length. */
export type StoredVideo = Readonly<{ versionId: string; bytes: Buffer; durationMs: number }>;
/** `gone`: the clip was made for a Shot that left the storyboard, so it was saved as a generated video. */
export type GeneratedVideoSave = Readonly<{ version: VideoVersion; use: z.infer<typeof clipUseSchema> | z.infer<typeof useSchema>; gone: boolean }>;
/** Work that must commit with the clip, inside its transaction (the job's success, from `application`). */
export type WithinSave = (client: PoolClient, version: VideoVersion) => Promise<unknown>;
export type GeneratedVideoCollaborators = Readonly<{
  storage?: PrivateObjectStorage | undefined; verifyMedia?: MediaVerifier | undefined;
  capacityWaitMs?: number; capacityRetryMs?: number;
}>;

// A clip's input images: its frames, or up to 9 reference images (MiniMax's limit).
const framesSchema = z.array(idSchema).max(9).refine(ids => new Set(ids).size === ids.length);
const joinedSchema = z.strictObject({ clips: z.array(idSchema).min(joinableClips.min).max(joinableClips.max).refine(ids => new Set(ids).size === ids.length), frameMs: z.number().positive().max(1000) });
const binding = { purpose: 'video' } as const;

/** The id of a Shot's own video artifact, derived from the video and Shot. */
export const shotArtifactId = (conversation: string, shotId: string) => derivedArtifactId('shot', [conversation, shotId]);
const shotBinding = (shotId: string): DerivedBinding => ({ purpose: 'shot_video', shotId });
/** The draft use on the latest version of the Shot's own video, which the next version moves. */
const shotUse = (client: Parameters<typeof movableUse>[0], account: string, conversation: string, shotId: string, lock: boolean) =>
  movableUse(client, account, conversation, shotArtifactId(conversation, shotId), shotBinding(shotId), lock);

/**
 * The assistant's clip capability: it checks a provider's clip with the assistant allowance, stores it and its
 * poster privately and saves it as the video's draft clip, with its frames as dependencies. A clip made for a Shot is
 * the next version of that Shot's own video, with a draft `shot_video` use by the use rule; an assistant use never
 * approves, and a person's chosen Shot video stays chosen.
 */
export function createGeneratedVideos(pool: Pool, checkOwnedConversation: OwnedCheck, collaborators: GeneratedVideoCollaborators) {
  const capacityWaitMs = collaborators.capacityWaitMs ?? sandboxTurn.waitMs, capacityRetryMs = collaborators.capacityRetryMs ?? sandboxTurn.retryMs;
  const reads = createArtifactStore(pool, checkOwnedConversation);

  return Object.freeze({
    /** Whether the Shot's next video can be kept: it moves a draft use, or the video has room for a new one. */
    async hasShotRoom(account: string, conversation: string, shotId: string): Promise<boolean> {
      try {
        await requireOwnedConversation(checkOwnedConversation, account, conversation);
        return await hasDerivedRoom(pool, account, conversation, shotArtifactId(conversation, shotId), shotBinding(shotId));
      } catch (error) { throw uploadError(error); }
    },

    async save(account: string, conversation: string, input: GeneratedVideoInput, options: Readonly<{ signal?: AbortSignal | undefined; within?: WithinSave | undefined }> = {}): Promise<GeneratedVideoSave> {
      try {
        if (!idSchema.safeParse(account).success || !idSchema.safeParse(conversation).success) throw new UploadError('invalid_input');
        if (!framesSchema.safeParse(input.frames).success) throw new UploadError('not_found');
        if (input.target !== undefined && !idSchema.safeParse(input.target.shotId).success) throw new UploadError('invalid_input');
        if (input.joined !== undefined && (!joinedSchema.safeParse(input.joined).success || input.frames.length || input.target)) throw new UploadError('invalid_input');
        if (!(input.bytes instanceof Uint8Array) || !input.bytes.byteLength || input.bytes.byteLength > MAX_UPLOAD_VIDEO_BYTES) throw new UploadError('unsupported');
        const { storage, verifyMedia } = collaborators;
        if (!storage || !verifyMedia) throw new UploadError('not_implemented', 'Private storage or media checks are not available');
        let expectedMs: number | undefined;
        if (input.joined) {
          // Ownership is checked by the workspace read; each clip must be a video this video uses. Like frames, they are
          // checked before the transaction: a version never changes owner.
          const used = usedVideoVersions(await reads.workspace(account, conversation));
          if (input.joined.clips.some(id => !used.has(id))) throw new UploadError('not_found');
          expectedMs = input.joined.clips.reduce((sum, id) => sum + used.get(id)!.durationMs, 0);
        } else if (input.target) {
          // A Shot's frames were its panels' images; once the Shot is gone they are no longer images the video uses,
          // so they are checked only as the account's images. They stay the clip's dependencies.
          await requireOwnedConversation(checkOwnedConversation, account, conversation);
          for (const id of input.frames) if ((await reads.version(account, id)).kind !== 'image') throw new UploadError('not_found');
        } else {
          // Ownership is checked by the workspace read; each frame must be an image this video uses.
          const used = usedImageVersions(await reads.workspace(account, conversation));
          if (input.frames.some(id => !used.has(id))) throw new UploadError('not_found');
        }
        const bytes = Buffer.from(input.bytes);
        const verified = await verifyWhenFree(verifyMedia, { kind: 'video', bytes, contentType: 'video/mp4', origin: 'assistant' }, { waitMs: capacityWaitMs, retryMs: capacityRetryMs, signal: options.signal });
        const media = measuredMedia({ kind: 'video', contentType: 'video/mp4', byteSize: bytes.length }, verified);
        if (!verified.poster) throw new UploadError('integration_failure');
        // Each saved length is rounded to a millisecond, so the sum may drift by half of one per clip.
        if (expectedMs !== undefined && Math.abs((media.durationMs ?? 0) - expectedMs) > input.joined!.frameMs + input.joined!.clips.length / 2) throw new UploadError('invalid_input');
        const poster = { bytes: Buffer.from(verified.poster.bytes), contentType: verified.poster.contentType };
        const id = randomUUID(), key = `published/${id}/${id}`, posterKey = `posters/${id}/${id}`;
        // A stopped run stores nothing after its check.
        options.signal?.throwIfAborted();
        return await withStoredObjects(storage, [{ key, bytes, contentType: 'video/mp4' }, { key: posterKey, ...poster }], () => transaction(pool, async client => {
          await lockPublicationOwner(client, account);
          // The Shot must still be in the storyboard the video uses. If it left while the clip was made, the paid
          // clip is kept as a generated video instead.
          const shot = input.target && hasTarget((await usedPlan(client, account, conversation, true))?.content, input.target) ? input.target.shotId : undefined;
          const artifactId = shot ? shotArtifactId(conversation, shot) : undefined;
          if (artifactId) await ensureDerivedArtifact(client, account, artifactId, 'video');
          const moved = shot ? await shotUse(client, account, conversation, shot, true) : undefined;
          // A Shot's clip with no room stays with its job, which can be resumed; a plain clip's save is unavailable.
          if (!moved) await (input.target ? requireRoom : requireUseRoom)(client, account, conversation);
          const version = await publishVersion(client, { accountId: account, conversationId: conversation, artifactId, kind: 'video', media, dependencies: input.joined?.clips ?? input.frames, createdBy: 'assistant' });
          if (version.kind !== 'video') throw new UploadError('integration_failure');
          const clip = { ...version, kind: 'video' as const };
          const insertObject = 'INSERT INTO artifacts.generated_objects(owner_id,object_key,version_id,sha256,byte_size,content_type) VALUES($1,$2,$3,$4,$5,$6)';
          await client.query(insertObject, [account, key, version.id, digest(bytes), bytes.length, 'video/mp4']);
          await client.query(insertObject, [account, posterKey, version.id, digest(poster.bytes), poster.bytes.length, poster.contentType]);
          await client.query('INSERT INTO artifacts.media_objects(owner_id,version_id,generated_key,generated_poster_key,sha256) VALUES($1,$2,$3,$4,$5)', [account, version.id, key, posterKey, digest(bytes)]);
          if (shot) {
            const use = useSchema.parse({ id: await bindDerivedDraft(client, account, conversation, version.id, shotBinding(shot), moved), versionId: version.id, binding: shotBinding(shot), state: 'draft' });
            await options.within?.(client, clip);
            return { version: clip, use, gone: false };
          }
          // A made clip is a draft: technical success never grants approval.
          const use = clipUseSchema.parse({ id: randomUUID(), versionId: version.id, binding, state: 'draft' });
          await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'video','draft')", [account, conversation, use.id, version.id, binding]);
          await options.within?.(client, clip);
          return { version: clip, use, gone: input.target !== undefined };
        }), 'Generated video');
      } catch (error) {
        if (error instanceof AggregateError || error instanceof UseRoomError) throw error;
        throw uploadError(error);
      }
    },

    /** The exact stored bytes of a video version this account can read; the caller decides which uses allow it. */
    async read(account: string, versionId: string): Promise<StoredVideo> {
      try {
        const { storage } = collaborators;
        if (!storage) throw new UploadError('not_implemented', 'Private storage is not available');
        const version = await reads.version(account, versionId);
        if (version.kind !== 'video') throw new UploadError('not_found');
        return { versionId, bytes: await readCheckedMedia(pool, storage, version, version.builtIn ? BUILT_IN_OWNER : account, MAX_UPLOAD_VIDEO_BYTES), durationMs: version.media.durationMs ?? 0 };
      } catch (error) { throw uploadError(error); }
    },
  });
}
export type GeneratedVideos = ReturnType<typeof createGeneratedVideos>;
