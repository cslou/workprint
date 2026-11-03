import type { Version } from '@workprint/contracts';
import { ArtifactError, SheetSaveError, type AssistantSheetInput, type AssistantSheetSave } from '../artifacts/index.js';
import { logFailure } from './failure-log.js';

/** What a sheet save by the assistant did; never an approval, and never says whether another account's video exists. */
export type AssistantSheetOutcome =
  | { kind: 'saved'; versionId: string; revision: number; subjectName: string }
  | { kind: 'no_script' } | { kind: 'not_in_script' } | { kind: 'not_found' } | { kind: 'stale' }
  | { kind: 'invalid'; field: 'images' | 'text' } | { kind: 'in_other_sheet'; subjectName: string } | { kind: 'no_room' } | { kind: 'unavailable' };
/** Account and video come from trusted server context (an admitted native run), never from model arguments. */
export type SaveAssistantSheet = (accountId: string, videoId: string, input: AssistantSheetInput) => Promise<AssistantSheetOutcome>;
/** How many more uses the video can hold, or `unavailable`. */
export type SheetUseRoom = (accountId: string, videoId: string) => Promise<{ kind: 'room'; room: number } | { kind: 'not_found' } | { kind: 'unavailable' }>;
/** One image a current sheet lists, even when its own use has moved on; anything else is `not_found`. */
export type ReadSheetView = (accountId: string, videoId: string, versionId: string) => Promise<{ kind: 'found'; version: Version } | { kind: 'not_found' } | { kind: 'unavailable' }>;
export type AssistantSheets = Readonly<{ save: SaveAssistantSheet; useRoom: SheetUseRoom; readView: ReadSheetView }>;

type Capability = Readonly<{
  save: (account: string, conversation: string, input: AssistantSheetInput) => Promise<AssistantSheetSave>;
  useRoom: (account: string, conversation: string) => Promise<number>;
  view: (account: string, conversation: string, versionId: string) => Promise<Version>;
}>;

/** In-process sheet saves for agent tools, over the assistant-only sheet capability. */
export function createAssistantSheets(capability: Capability): AssistantSheets {
  return Object.freeze({
    async save(accountId, videoId, input) {
      try {
        const { version, subjectName } = await capability.save(accountId, videoId, input);
        return { kind: 'saved', versionId: version.id, revision: version.revision, subjectName };
      } catch (error) {
        if (error instanceof SheetSaveError) {
          if (error.reason === 'invalid') return { kind: 'invalid', field: error.detail === 'text' ? 'text' : 'images' };
          if (error.reason === 'in_other_sheet') return { kind: 'in_other_sheet', subjectName: error.detail ?? '' };
          return { kind: error.reason };
        }
        if (error instanceof ArtifactError && error.code === 'not_found') return { kind: 'not_found' };
        logFailure('Assistant sheet save failed', error);
        return { kind: 'unavailable' };
      }
    },
    async useRoom(accountId, videoId) {
      try { return { kind: 'room', room: await capability.useRoom(accountId, videoId) }; } catch (error) {
        if (error instanceof ArtifactError && error.code === 'not_found') return { kind: 'not_found' };
        logFailure('Sheet use room read failed', error);
        return { kind: 'unavailable' };
      }
    },
    async readView(accountId, videoId, versionId) {
      try { return { kind: 'found', version: await capability.view(accountId, videoId, versionId) }; } catch (error) {
        if (error instanceof ArtifactError && error.code === 'not_found') return { kind: 'not_found' };
        logFailure('Sheet view read failed', error);
        return { kind: 'unavailable' };
      }
    },
  });
}
