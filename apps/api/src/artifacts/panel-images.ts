import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { idSchema, type Version } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import { withStoredObjects } from './generated-media.js';
import { assertMadeImage, assertReadableImages, checkImage, publishImage, type GeneratedImageCollaborators } from './generated-images.js';
import { hasTarget, usedPlan } from './panel-targets.js';
import { lockPublicationOwner } from './publication.js';
import { createArtifactStore } from './store.js';
import { UploadError, uploadError } from './uploads/errors.js';
import type { OwnedCheck } from './uploads/types.js';
import { useRoom } from './use-room.js';

type Query = Pick<PoolClient, 'query'>;
/** A panel of the storyboard the video uses. */
export type PanelTarget = Readonly<{ shotId: string; panelId: string }>;
/** An image the assistant made for a panel, with the images it was made from. */
export type PanelImageInput = PanelTarget & Readonly<{ bytes: Uint8Array; contentType: string; inputs: readonly string[] }>;
/** `gone`: the panel left the storyboard while the image was made, so it was saved as a plain draft image. */
export type PanelImageSave = Readonly<{ version: Extract<Version, { kind: 'image' | 'video' }>; gone: boolean }>;

/** The video has no room for the use a panel image needs; the image is not kept. */
export class PanelRoomError extends Error {
  constructor() { super('The video has no room for another use'); }
}

/**
 * The id of a panel's own image artifact, derived from the video, Shot and panel. It is never found through what a
 * person chose for the panel, so an image a person "Use"s there is never versioned by the assistant.
 */
export const panelArtifactId = (conversation: string, target: PanelTarget) => createHash('sha256').update(`panel:${JSON.stringify([conversation, target.shotId, target.panelId])}`).digest('hex');
const panelBinding = (target: PanelTarget) => ({ purpose: 'panel_image', shotId: target.shotId, panelId: target.panelId });

/**
 * The draft use on the latest version of the panel's own image, which the next version moves. Undefined when that
 * version's use is approved (a person chose it) or there is none yet: the next version then needs a new use.
 */
async function movableUse(client: Query, account: string, conversation: string, target: PanelTarget, lock: boolean): Promise<string | undefined> {
  return (await client.query<{ use_id: string }>(`SELECT u.use_id FROM artifacts.conversation_uses u
    WHERE u.owner_id=$1 AND u.conversation_id=$2 AND u.binding=$3::jsonb AND u.state='draft' AND u.version_owner_id=$1
      AND u.version_id=(SELECT version_id FROM artifacts.versions WHERE owner_id=$1 AND artifact_id=$4 ORDER BY revision DESC LIMIT 1)
    ORDER BY u.use_id LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [account, conversation, panelBinding(target), panelArtifactId(conversation, target)])).rows[0]?.use_id;
}

/**
 * The assistant's panel images: each is the next version of its panel's own image artifact, checked and stored as
 * generate-image's are, with a draft `panel_image` use and never a `reference` one. An assistant use never approves.
 */
export function createPanelImages(pool: Pool, checkOwnedConversation: OwnedCheck, collaborators: GeneratedImageCollaborators) {
  const capacityWaitMs = collaborators.capacityWaitMs ?? 30_000, capacityRetryMs = collaborators.capacityRetryMs ?? 250;
  const reads = createArtifactStore(pool, checkOwnedConversation);
  const owned = async (account: string, conversation: string) => {
    if (!idSchema.safeParse(account).success || !idSchema.safeParse(conversation).success) throw new UploadError('invalid_input');
    const outcome = await checkOwnedConversation(account, conversation);
    if (outcome.kind !== 'owned') throw new UploadError(outcome.kind === 'not_found' ? 'not_found' : 'integration_failure');
  };

  return Object.freeze({
    /** Whether the panel's next image can be kept: it moves a draft use, or the video has room for a new one. */
    async hasRoom(account: string, conversation: string, target: PanelTarget): Promise<boolean> {
      try {
        await owned(account, conversation);
        return Boolean(await movableUse(pool, account, conversation, target, false)) || await useRoom(pool, account, conversation) > 0;
      } catch (error) { throw uploadError(error); }
    },

    async save(account: string, conversation: string, input: PanelImageInput, signal?: AbortSignal): Promise<PanelImageSave> {
      try {
        assertMadeImage(input);
        const { storage, verifyMedia } = collaborators;
        if (!storage || !verifyMedia) throw new UploadError('not_implemented', 'Private storage or media checks are not available');
        await owned(account, conversation);
        await assertReadableImages(reads, account, input.inputs);
        const image = await checkImage({ verifyMedia, waitMs: capacityWaitMs, retryMs: capacityRetryMs, signal }, input);
        // A stopped run stores nothing after its check.
        signal?.throwIfAborted();
        return await withStoredObjects(storage, [{ key: image.key, bytes: image.bytes, contentType: image.contentType }], () => transaction(pool, async client => {
          await lockPublicationOwner(client, account);
          const room = async () => { if (await useRoom(client, account, conversation) === 0) throw new PanelRoomError(); };
          // The panel must still be in the storyboard the video uses. If it left while the image was made, the paid
          // image is kept as a plain draft image instead.
          const board = await usedPlan(client, account, conversation, true);
          if (!hasTarget(board?.content, input)) {
            await room();
            const version = await publishImage(client, account, conversation, image, input.inputs);
            await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'reference','draft')", [account, conversation, randomUUID(), version.id, { purpose: 'reference' }]);
            return { version, gone: true };
          }
          const artifactId = panelArtifactId(conversation, input);
          await client.query("INSERT INTO artifacts.artifacts(owner_id,artifact_id,kind) VALUES($1,$2,'image') ON CONFLICT DO NOTHING", [account, artifactId]);
          const moved = await movableUse(client, account, conversation, input, true);
          if (!moved) await room();
          const version = await publishImage(client, account, conversation, image, input.inputs, artifactId);
          // A made image is a draft: technical success never grants approval, and a person's choice stays as it is.
          if (moved) await client.query("UPDATE artifacts.conversation_uses SET version_id=$1 WHERE owner_id=$2 AND use_id=$3", [version.id, account, moved]);
          else await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'panel_image','draft')", [account, conversation, randomUUID(), version.id, panelBinding(input)]);
          return { version, gone: false };
        }), 'Panel image');
      } catch (error) {
        if (error instanceof AggregateError || error instanceof PanelRoomError) throw error;
        throw uploadError(error);
      }
    },
  });
}
export type PanelImages = ReturnType<typeof createPanelImages>;
