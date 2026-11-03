import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { idSchema, MAX_UPLOAD_IMAGE_BYTES, useSchema, type Version } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import type { PrivateObjectStorage } from '../storage/index.js';
import { digest, requireUseRoom, withStoredObjects } from './generated-media.js';
import { protectedMediaObjects } from './media-objects.js';
import { lockPublicationOwner, publishVersion } from './publication.js';
import { scriptSubjectsNow } from './script-reads.js';
import { BUILT_IN_OWNER, createArtifactStore } from './store.js';
import { UploadError, uploadError } from './uploads/errors.js';
import { measuredMedia, verifyWhenFree } from './uploads/media-verifier.js';
import type { MediaVerifier, OwnedCheck } from './uploads/types.js';

/**
 * `revises`, one of `inputs`, names the image this one changes: it is saved as that image's next version.
 * `subject` is the script subject id to file the image under; without one, a next version keeps its image's subject.
 */
export type GeneratedImageInput = Readonly<{ bytes: Uint8Array; contentType: string; inputs: readonly string[]; revises?: string | undefined; subject?: string | undefined }>;
/** `subjectLeft`: the subject asked for is no longer in the script, so the image was saved unfiled. */
export type GeneratedImageSave = Readonly<{ version: Extract<Version, { kind: 'image' | 'video' }>; use: z.infer<typeof useSchema>; subjectLeft: boolean }>;
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
type ImageMedia = Extract<Version, { kind: 'image' | 'video' }>['media'];
type Reads = ReturnType<typeof createArtifactStore>;

/** An assistant-made image whose bytes passed the media checks, with the private key it is stored under. */
export type CheckedImage = Readonly<{ bytes: Buffer; contentType: string; media: ImageMedia; key: string; sha256: string }>;
type ImageChecks = Readonly<{ verifyMedia: MediaVerifier; waitMs: number; retryMs: number; signal?: AbortSignal | undefined }>;

/** The ids of a made image's inputs, and its bytes, before anything else is checked. */
function assertMadeImage(input: Readonly<{ bytes: Uint8Array; inputs: readonly string[] }>): void {
  // Inputs that aren't distinct ids can't name saved images.
  if (!inputsSchema.safeParse(input.inputs).success) throw new UploadError('not_found');
  if (!(input.bytes instanceof Uint8Array) || !input.bytes.byteLength || input.bytes.byteLength > MAX_UPLOAD_IMAGE_BYTES) throw new UploadError('unsupported');
}

/** Each input must be an image this account can read, before anything is stored. */
async function assertReadableImages(reads: Reads, account: string, inputs: readonly string[]): Promise<void> {
  for (const id of inputs) if ((await reads.version(account, id)).kind !== 'image') throw new UploadError('not_found');
}

/** Checks assistant-made bytes as strictly as an upload, waiting out a busy checker, and gives them a private key. */
async function checkImage(checks: ImageChecks, input: Readonly<{ bytes: Uint8Array; contentType: string }>): Promise<CheckedImage> {
  const bytes = Buffer.from(input.bytes);
  const verified = await verifyWhenFree(checks.verifyMedia, { kind: 'image', bytes, contentType: input.contentType, origin: 'assistant' }, { waitMs: checks.waitMs, retryMs: checks.retryMs, signal: checks.signal });
  const media = measuredMedia({ kind: 'image', contentType: input.contentType, byteSize: bytes.length }, verified);
  const id = randomUUID();
  return { bytes, contentType: input.contentType, media, key: `published/${id}/${id}`, sha256: digest(bytes) };
}

/** Records a stored image's object on its new version, inside the save's transaction. */
async function recordImageObject(client: PoolClient, account: string, versionId: string, image: CheckedImage): Promise<void> {
  await client.query('INSERT INTO artifacts.generated_objects(owner_id,object_key,version_id,sha256,byte_size,content_type) VALUES($1,$2,$3,$4,$5,$6)', [account, image.key, versionId, image.sha256, image.bytes.length, image.contentType]);
  await client.query('INSERT INTO artifacts.media_objects(owner_id,version_id,generated_key,sha256) VALUES($1,$2,$3,$4)', [account, versionId, image.key, image.sha256]);
}

/** Publishes a stored image as the assistant's version, a new artifact's or `artifactId`'s next, with its inputs as dependencies. */
export async function publishImage(client: PoolClient, account: string, conversation: string, image: CheckedImage, inputs: readonly string[], artifactId?: string): Promise<Extract<Version, { kind: 'image' | 'video' }>> {
  // No base check: versions made at once land as successive versions, and none is lost.
  const version = await publishVersion(client, { accountId: account, conversationId: conversation, artifactId, kind: 'image', media: image.media, dependencies: inputs, createdBy: 'assistant' });
  if (version.kind !== 'image') throw new UploadError('integration_failure');
  await recordImageObject(client, account, version.id, image);
  return version;
}

/** The run's own account and video, as ids, owned: a foreign or unknown video is `not_found`. */
export async function requireOwnedConversation(checkOwnedConversation: OwnedCheck, account: string, conversation: string): Promise<void> {
  if (!idSchema.safeParse(account).success || !idSchema.safeParse(conversation).success) throw new UploadError('invalid_input');
  const owned = await checkOwnedConversation(account, conversation);
  if (owned.kind !== 'owned') throw new UploadError(owned.kind === 'not_found' ? 'not_found' : 'integration_failure');
}

/** Keeps an assistant-made image: `within` runs inside its save's transaction, after the owner lock, with the checked image. */
export type KeepImage = <T>(account: string, conversation: string, input: Readonly<{ bytes: Uint8Array; contentType: string; inputs: readonly string[] }>,
  within: (client: PoolClient, image: CheckedImage) => Promise<T>, options: Readonly<{ signal?: AbortSignal | undefined; label: string }>) => Promise<T>;

/**
 * The one way the assistant's images are kept. The account and video are checked, each input must be an image the
 * account can read, and the bytes are checked as strictly as an upload, all before anything is stored; a stopped run
 * stores nothing after its check. The object is stored, then `within` saves it; if that throws, the object is removed.
 */
export function assistantImageKeeper(pool: Pool, checkOwnedConversation: OwnedCheck, collaborators: GeneratedImageCollaborators): KeepImage {
  const capacityWaitMs = collaborators.capacityWaitMs ?? 30_000, capacityRetryMs = collaborators.capacityRetryMs ?? 250;
  const reads = createArtifactStore(pool, checkOwnedConversation);
  return async (account, conversation, input, within, { signal, label }) => {
    if (!idSchema.safeParse(account).success || !idSchema.safeParse(conversation).success) throw new UploadError('invalid_input');
    assertMadeImage(input);
    const { storage, verifyMedia } = collaborators;
    if (!storage || !verifyMedia) throw new UploadError('not_implemented', 'Private storage or media checks are not available');
    await requireOwnedConversation(checkOwnedConversation, account, conversation);
    await assertReadableImages(reads, account, input.inputs);
    const image = await checkImage({ verifyMedia, waitMs: capacityWaitMs, retryMs: capacityRetryMs, signal }, input);
    signal?.throwIfAborted();
    return withStoredObjects(storage, [{ key: image.key, bytes: image.bytes, contentType: image.contentType }], () => transaction(pool, async client => {
      await lockPublicationOwner(client, account);
      return within(client, image);
    }), label);
  };
}

/**
 * The assistant's image capability: it checks assistant-made bytes as strictly as uploads, stores them privately
 * and saves them as the video's draft images. Saved images, uploaded or made, can be read back as exact bytes.
 */
export function createGeneratedImages(pool: Pool, checkOwnedConversation: OwnedCheck, collaborators: GeneratedImageCollaborators) {
  const required = () => {
    if (!collaborators.storage || !collaborators.verifyMedia) throw new UploadError('not_implemented', 'Private storage or media checks are not available');
    return { storage: collaborators.storage, verifyMedia: collaborators.verifyMedia };
  };
  const reads = createArtifactStore(pool, checkOwnedConversation), keep = assistantImageKeeper(pool, checkOwnedConversation, collaborators);

  return Object.freeze({
    async save(account: string, conversation: string, input: GeneratedImageInput, signal?: AbortSignal): Promise<GeneratedImageSave> {
      try {
        return await keep(account, conversation, input, async (client, image) => {
            // An edit of one of this video's own images is that image's next version, in the same place in the video.
            // A built-in image, or one the video doesn't use as an image, can't be revised: the edit is a new image.
            // So is an approved one: a person's approval is never replaced by an assistant draft.
            const revised = input.revises && input.inputs.includes(input.revises) ? (await client.query<{ use_id: string; artifact_id: string }>(`SELECT u.use_id,v.artifact_id
              FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.version_owner_id AND v.version_id=u.version_id
              JOIN artifacts.versions r ON r.owner_id=$1 AND r.version_id=$3 AND r.artifact_id=v.artifact_id
              WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.purpose='reference' AND u.state='draft' AND u.version_owner_id=$1 AND v.kind='image'
              ORDER BY u.created_at,u.use_id LIMIT 1 FOR UPDATE OF u`, [account, conversation, input.revises])).rows[0] : undefined;
            if (!revised) await requireUseRoom(client, account, conversation);
            // The subject is checked against the script the video uses now: one removed while the image was made
            // leaves it unfiled (null), and the paid image is still saved. Undefined: none asked for.
            let filed: string | null | undefined;
            if (input.subject !== undefined) {
              const subjects = await scriptSubjectsNow(client, account, conversation);
              filed = subjects?.some(subject => subject.id === input.subject) ? input.subject : null;
            }
            const version = await publishImage(client, account, conversation, image, input.inputs, revised?.artifact_id);
            // A made image is a draft: technical success never grants approval.
            const use = useSchema.parse({ id: revised?.use_id ?? randomUUID(), versionId: version.id, binding, state: 'draft' });
            if (revised && filed === undefined) await client.query("UPDATE artifacts.conversation_uses SET version_id=$1,state='draft' WHERE owner_id=$2 AND use_id=$3", [version.id, account, use.id]);
            else if (revised) await client.query("UPDATE artifacts.conversation_uses SET version_id=$1,state='draft',subject_id=$4 WHERE owner_id=$2 AND use_id=$3", [version.id, account, use.id, filed]);
            else await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state,subject_id) VALUES($1,$2,$3,$4,$5,'reference','draft',$6)", [account, conversation, use.id, version.id, binding, filed ?? null]);
            return { version, use, subjectLeft: filed === null };
          }, { signal, label: 'Generated image' });
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
