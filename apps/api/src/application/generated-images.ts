import { ArtifactError, UploadError, usedImageVersions, type GeneratedImageInput, type GeneratedImageSave, type StoredImage } from '../artifacts/index.js';
import { logFailure } from './failure-log.js';
import type { SavedWorkReads } from './saved-reads.js';

/** What saving an assistant-made image did. `refused` means the bytes didn't pass the media checks. */
export type GeneratedImageOutcome =
  | { kind: 'saved'; versionId: string; width: number; height: number }
  | { kind: 'refused' } | { kind: 'not_found' } | { kind: 'unavailable' };
/** Account and video come from trusted server context (an admitted native run), never from model arguments. */
export type SaveGeneratedImage = (accountId: string, videoId: string, input: GeneratedImageInput, signal?: AbortSignal) => Promise<GeneratedImageOutcome>;

/** Saved images as provider inputs, with their saved size. `not_found` covers the whole call when any id isn't an image this video uses. */
export type ImageInputsOutcome = { kind: 'read'; images: { versionId: string; dataUrl: string; width: number; height: number }[] } | { kind: 'not_found' } | { kind: 'unavailable' };
export type ReadImageInputs = (accountId: string, videoId: string, versionIds: readonly string[]) => Promise<ImageInputsOutcome>;


/** In-process image saves for agent tools, over the assistant-only image capability. */
export function createGeneratedImageSaver(save: (account: string, conversation: string, input: GeneratedImageInput, signal?: AbortSignal) => Promise<GeneratedImageSave>): SaveGeneratedImage {
  return async (accountId, videoId, input, signal) => {
    try {
      const { version } = await save(accountId, videoId, input, signal);
      return { kind: 'saved', versionId: version.id, width: version.media.width, height: version.media.height };
    } catch (error) {
      if (error instanceof UploadError && (error.code === 'invalid_input' || error.code === 'unsupported')) return { kind: 'refused' };
      if (error instanceof UploadError && error.code === 'not_found') return { kind: 'not_found' };
      logFailure('Generated image save failed', error);
      return { kind: 'unavailable' };
    }
  };
}

/** Reads saved images as data URLs, only when the owned video uses each exact image version. */
export function createImageInputReader(reads: Pick<SavedWorkReads, 'workspace'>, read: (account: string, versionId: string) => Promise<StoredImage>): ReadImageInputs {
  return async (accountId, videoId, versionIds) => {
    try {
      const used = usedImageVersions(await reads.workspace(accountId, videoId));
      // At most Meta's 10 inputs, each named once.
      if (versionIds.length > 10 || new Set(versionIds).size !== versionIds.length || versionIds.some(id => !used.has(id))) return { kind: 'not_found' };
      const images = [];
      for (const id of versionIds) {
        const image = await read(accountId, id);
        images.push({ versionId: image.versionId, dataUrl: `data:${image.contentType};base64,${image.bytes.toString('base64')}`, width: image.width, height: image.height });
      }
      return { kind: 'read', images };
    } catch (error) {
      if ((error instanceof UploadError || error instanceof ArtifactError) && error.code === 'not_found') return { kind: 'not_found' };
      logFailure('Image input read failed', error);
      return { kind: 'unavailable' };
    }
  };
}
