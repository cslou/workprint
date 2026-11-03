import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Version } from '@workprint/contracts';
import { derivedArtifactId, ensureDerivedArtifact, movableUse } from './derived-artifacts.js';
import { assistantImageKeeper, publishImage, requireOwnedConversation, type GeneratedImageCollaborators } from './generated-images.js';
import { hasTarget, usedPlan } from './panel-targets.js';
import { uploadError } from './uploads/errors.js';
import type { OwnedCheck } from './uploads/types.js';
import { requireRoom, useRoom, UseRoomError } from './use-room.js';

/** A panel of the storyboard the video uses. */
export type PanelTarget = Readonly<{ shotId: string; panelId: string }>;
/** An image the assistant made for a panel, with the images it was made from. */
export type PanelImageInput = PanelTarget & Readonly<{ bytes: Uint8Array; contentType: string; inputs: readonly string[] }>;
/** `gone`: the panel left the storyboard while the image was made, so it was saved as a plain draft image. */
export type PanelImageSave = Readonly<{ version: Extract<Version, { kind: 'image' | 'video' }>; gone: boolean }>;

/** The id of a panel's own image artifact, derived from the video, Shot and panel. */
export const panelArtifactId = (conversation: string, target: PanelTarget) => derivedArtifactId('panel', [conversation, target.shotId, target.panelId]);
const panelBinding = (target: PanelTarget) => ({ purpose: 'panel_image', shotId: target.shotId, panelId: target.panelId });
/** The draft use on the latest version of the panel's own image, which the next version moves. */
const panelUse = (client: Parameters<typeof movableUse>[0], account: string, conversation: string, target: PanelTarget, lock: boolean) =>
  movableUse(client, account, conversation, panelArtifactId(conversation, target), panelBinding(target), lock);

/**
 * The assistant's panel images: each is the next version of its panel's own image artifact, checked and stored as
 * generate-image's are, with a draft `panel_image` use and never a `reference` one. An assistant use never approves.
 */
export function createPanelImages(pool: Pool, checkOwnedConversation: OwnedCheck, collaborators: GeneratedImageCollaborators) {
  const keep = assistantImageKeeper(pool, checkOwnedConversation, collaborators);

  return Object.freeze({
    /** Whether the panel's next image can be kept: it moves a draft use, or the video has room for a new one. */
    async hasRoom(account: string, conversation: string, target: PanelTarget): Promise<boolean> {
      try {
        await requireOwnedConversation(checkOwnedConversation, account, conversation);
        return Boolean(await panelUse(pool, account, conversation, target, false)) || await useRoom(pool, account, conversation) > 0;
      } catch (error) { throw uploadError(error); }
    },

    async save(account: string, conversation: string, input: PanelImageInput, signal?: AbortSignal): Promise<PanelImageSave> {
      try {
        return await keep(account, conversation, input, async (client, image) => {
          const room = () => requireRoom(client, account, conversation);
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
          await ensureDerivedArtifact(client, account, artifactId, 'image');
          const moved = await panelUse(client, account, conversation, input, true);
          if (!moved) await room();
          const version = await publishImage(client, account, conversation, image, input.inputs, artifactId);
          // A made image is a draft: technical success never grants approval, and a person's choice stays as it is.
          if (moved) await client.query("UPDATE artifacts.conversation_uses SET version_id=$1 WHERE owner_id=$2 AND use_id=$3", [version.id, account, moved]);
          else await client.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'panel_image','draft')", [account, conversation, randomUUID(), version.id, panelBinding(input)]);
          return { version, gone: false };
        }, { signal, label: 'Panel image' });
      } catch (error) {
        if (error instanceof AggregateError || error instanceof UseRoomError) throw error;
        throw uploadError(error);
      }
    },
  });
}
export type PanelImages = ReturnType<typeof createPanelImages>;
