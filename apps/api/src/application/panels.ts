import type { MetaImageClient } from '../generation/index.js';
import type { AssistantPanelImages } from './assistant-panel-images.js';
import { requestOneImage, type ImageFailure, type ReadImageInputs } from './generated-images.js';
import { panelInputs, type PanelRequest } from './panel-inputs.js';
import type { ReadOwnedWorkspace } from './workspace-reads.js';
import { imageVersionNames } from './workspace-versions.js';

/** What making a panel needs; agent composition supplies these. Without `images` nothing is sent. */
export type PanelMakers = Readonly<{
  readWorkspace: ReadOwnedWorkspace; readImageInputs: ReadImageInputs;
  /** Absent where images can't be saved, like `images`: nothing is then sent. */
  panelImages?: AssistantPanelImages | undefined; images?: Pick<MetaImageClient, 'generate' | 'edit'> | undefined;
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
  const { images, panelImages } = makers;
  if (!images || !panelImages) return { kind: 'refused', reason: 'unsaveable' };
  const read = await makers.readWorkspace(accountId, videoId);
  if (read.kind !== 'found') return { kind: 'refused', reason: 'work_unavailable' };
  const chosen = panelInputs(read.workspace, request);
  if (chosen.kind === 'subject_gone' || chosen.kind === 'too_many') return chosen;
  if (chosen.kind !== 'resolved') return { kind: 'refused', reason: chosen.kind };
  const target = { shotId: request.shot, panelId: request.panel };
  const room = await panelImages.hasRoom(accountId, videoId, target);
  if (room.kind !== 'room') return { kind: 'refused', reason: room.kind === 'no_room' ? 'no_room' : 'work_unavailable' };

  const ids = chosen.inputs.map(input => input.versionId);
  let inputs: { dataUrl: string }[] = [];
  if (ids.length) {
    const loaded = await makers.readImageInputs(accountId, videoId, ids);
    if (loaded.kind === 'not_found') return { kind: 'refused', reason: 'image_not_found' };
    if (loaded.kind !== 'read') return { kind: 'refused', reason: 'work_unavailable' };
    inputs = loaded.images;
  }
  const response = await requestOneImage(images, {
    prompt: [chosen.preface, request.prompt.trim()].filter(Boolean).join('\n\n'),
    // Both frames of a Shot match: a later panel takes the first panel's size.
    size: chosen.size ? `${chosen.size.width}x${chosen.size.height}` : request.size, inputs,
  }, signal);
  if (response.kind === 'failed') return response;
  const made = response.image;
  const saved = await panelImages.save(accountId, videoId, { ...target, bytes: made.bytes, contentType: made.contentType, inputs: ids }, signal);
  signal.throwIfAborted();
  if (saved.kind === 'no_room') return { kind: 'not_kept' };
  if (saved.kind !== 'saved') return { kind: 'failed', failure: { reason: saved.kind === 'refused' ? 'checks' : 'not_saved' } };
  const after = await makers.readWorkspace(accountId, videoId);
  const label = after.kind === 'found' ? imageVersionNames(after.workspace)(saved.versionId) : undefined;
  return { kind: 'saved', versionId: saved.versionId, gone: saved.gone, ...(label ? { label } : {}) };
}
