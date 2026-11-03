import { PanelRoomError, UploadError, type PanelImageInput, type PanelImageSave, type PanelTarget } from '../artifacts/index.js';
import { MetaImageError, type MetaImageClient } from '../generation/index.js';
import { logFailure } from './failure-log.js';
import { metaImageFailure, type ImageFailure, type ReadImageInputs } from './generated-images.js';
import { panelInputs, type PanelRequest } from './panel-inputs.js';
import type { ReadOwnedWorkspace } from './workspace-reads.js';
import { imageVersionNames } from './workspace-versions.js';

/** What saving a panel image did. `gone`: its panel left the storyboard, so it was saved as a plain draft image. */
export type PanelSaveOutcome = { kind: 'saved'; versionId: string; gone: boolean } | { kind: 'refused' } | { kind: 'no_room' } | { kind: 'not_found' } | { kind: 'unavailable' };
/** The assistant's panel images for agent tools. Account and video come from the trusted run scope, never from model arguments. */
export type AssistantPanelImages = Readonly<{
  /** Whether the panel's next image can be kept: it moves a draft use, or the video has room for a new one. */
  hasRoom: (accountId: string, videoId: string, target: PanelTarget) => Promise<{ kind: 'room' } | { kind: 'no_room' } | { kind: 'unavailable' }>;
  save: (accountId: string, videoId: string, input: PanelImageInput, signal?: AbortSignal) => Promise<PanelSaveOutcome>;
}>;

type Capability = Readonly<{
  hasRoom: (account: string, conversation: string, target: PanelTarget) => Promise<boolean>;
  save: (account: string, conversation: string, input: PanelImageInput, signal?: AbortSignal) => Promise<PanelImageSave>;
}>;

/** In-process panel image saves for agent tools, over the assistant-only panel image capability. */
export function createAssistantPanelImages(capability: Capability): AssistantPanelImages {
  return Object.freeze({
    async hasRoom(accountId, videoId, target) {
      try {
        return { kind: await capability.hasRoom(accountId, videoId, target) ? 'room' : 'no_room' };
      } catch (error) {
        logFailure('Panel image room read failed', error);
        return { kind: 'unavailable' };
      }
    },
    async save(accountId, videoId, input, signal) {
      try {
        const { version, gone } = await capability.save(accountId, videoId, input, signal);
        return { kind: 'saved', versionId: version.id, gone };
      } catch (error) {
        if (error instanceof PanelRoomError) return { kind: 'no_room' };
        if (error instanceof UploadError && (error.code === 'invalid_input' || error.code === 'unsupported')) return { kind: 'refused' };
        if (error instanceof UploadError && error.code === 'not_found') return { kind: 'not_found' };
        logFailure('Panel image save failed', error);
        return { kind: 'unavailable' };
      }
    },
  });
}

/** What making a panel needs; agent composition supplies these. Without `images` nothing is sent. */
export type PanelMakers = Readonly<{
  readWorkspace: ReadOwnedWorkspace; readImageInputs: ReadImageInputs; panelImages: AssistantPanelImages;
  images?: Pick<MetaImageClient, 'generate' | 'edit'> | undefined;
}>;
/** One panel to make: Story 3's request, with the model's prompt and the shape for a Shot's first panel. */
export type MakePanelRequest = PanelRequest & Readonly<{ prompt: string; size: string }>;
export type PanelOutcome =
  /** `label` is the workspace's name for the saved image; absent when the workspace can't be read back. */
  | { kind: 'saved'; versionId: string; gone: boolean; label?: string }
  | { kind: 'refused'; reason: 'unsaveable' | 'not_found' | 'needs_first_panel' | 'image_not_found' | 'no_room' | 'work_unavailable' }
  | { kind: 'subject_gone'; subjectName: string }
  | { kind: 'too_many'; count: number }
  /** Meta didn't make the image, or its save didn't keep it. */
  | { kind: 'failed'; failure: ImageFailure }
  /** The image was made, but the video's last use was taken while it was made, so it wasn't kept. */
  | { kind: 'not_kept' };

/**
 * Makes one panel's image. Its inputs come from `panelInputs` alone, and every refusal comes before any request to
 * Meta: an unknown panel, a removed subject, a later panel before the first, an image the video doesn't use, too many
 * inputs, or no room for the use it needs. Meta gets the inputs in order, with their preface before the model's
 * prompt; a later panel takes the first panel's size. Stop throws from the signal.
 */
export async function makePanel(makers: PanelMakers, accountId: string, videoId: string, request: MakePanelRequest, { signal }: { signal: AbortSignal }): Promise<PanelOutcome> {
  const { images } = makers;
  if (!images) return { kind: 'refused', reason: 'unsaveable' };
  const read = await makers.readWorkspace(accountId, videoId);
  if (read.kind !== 'found') return { kind: 'refused', reason: 'work_unavailable' };
  const chosen = panelInputs(read.workspace, request);
  if (chosen.kind === 'subject_gone' || chosen.kind === 'too_many') return chosen;
  if (chosen.kind !== 'resolved') return { kind: 'refused', reason: chosen.kind };
  const target = { shotId: request.shot, panelId: request.panel };
  const room = await makers.panelImages.hasRoom(accountId, videoId, target);
  if (room.kind !== 'room') return { kind: 'refused', reason: room.kind === 'no_room' ? 'no_room' : 'work_unavailable' };

  const ids = chosen.inputs.map(input => input.versionId);
  let inputs: { dataUrl: string }[] = [];
  if (ids.length) {
    const loaded = await makers.readImageInputs(accountId, videoId, ids);
    if (loaded.kind === 'not_found') return { kind: 'refused', reason: 'image_not_found' };
    if (loaded.kind !== 'read') return { kind: 'refused', reason: 'work_unavailable' };
    inputs = loaded.images;
  }
  const meta = {
    prompt: [chosen.preface, request.prompt.trim()].filter(Boolean).join('\n\n'), n: 1,
    // Both frames of a Shot match: a later panel takes the first panel's size.
    size: chosen.size ? `${chosen.size.width}x${chosen.size.height}` : request.size,
    outputFormat: 'png' as const, reasoningStrength: 'high' as const, tools: { imageSearch: true, webSearch: true, shell: true },
  };
  let made;
  try {
    made = (inputs.length ? await images.edit({ ...meta, images: inputs.map(input => ({ dataUrl: input.dataUrl })) }, signal) : await images.generate(meta, signal)).images[0];
  } catch (error) {
    // Stop: the run's own handling ends the line as incomplete.
    if (error instanceof MetaImageError && error.code === 'aborted') signal.throwIfAborted();
    return { kind: 'failed', failure: metaImageFailure(error) };
  }
  // Nothing from a response is saved after Stop.
  signal.throwIfAborted();
  if (!made) return { kind: 'failed', failure: { reason: 'unavailable' } };
  const saved = await makers.panelImages.save(accountId, videoId, { ...target, bytes: made.bytes, contentType: made.contentType, inputs: ids }, signal);
  signal.throwIfAborted();
  if (saved.kind === 'no_room') return { kind: 'not_kept' };
  if (saved.kind !== 'saved') return { kind: 'failed', failure: { reason: saved.kind === 'refused' ? 'checks' : 'not_saved' } };
  const after = await makers.readWorkspace(accountId, videoId);
  const label = after.kind === 'found' ? imageVersionNames(after.workspace)(saved.versionId) : undefined;
  return { kind: 'saved', versionId: saved.versionId, gone: saved.gone, ...(label ? { label } : {}) };
}
