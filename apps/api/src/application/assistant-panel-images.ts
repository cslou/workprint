import { PanelRoomError, UploadError, type PanelImageInput, type PanelImageSave, type PanelTarget } from '../artifacts/index.js';
import { logFailure } from './failure-log.js';

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
