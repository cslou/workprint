import { ArtifactError, StoryboardSaveError, type AssistantStoryboardInput, type AssistantStoryboardSave } from '../artifacts/index.js';
import { logFailure } from './failure-log.js';

/** What a storyboard save by the assistant did; never an approval, and never says whether another account's video exists. */
export type AssistantStoryboardOutcome =
  | { kind: 'saved'; versionId: string; revision: number }
  | { kind: 'no_script' } | { kind: 'stale' } | { kind: 'not_found' }
  | { kind: 'not_in_script'; field: string } | { kind: 'role'; field: string } | { kind: 'no_place'; field: string; shot: number } | { kind: 'invalid'; field: string }
  | { kind: 'no_room' } | { kind: 'unavailable' };
/** Account and video come from trusted server context (an admitted native run), never from model arguments. */
export type SaveAssistantStoryboard = (accountId: string, videoId: string, input: AssistantStoryboardInput) => Promise<AssistantStoryboardOutcome>;

/** In-process storyboard saves for agent tools, over the assistant-only storyboard capability. */
export function createAssistantStoryboardSaver(save: (account: string, conversation: string, input: AssistantStoryboardInput) => Promise<AssistantStoryboardSave>): SaveAssistantStoryboard {
  return async (accountId, videoId, input) => {
    try {
      const { version } = await save(accountId, videoId, input);
      return { kind: 'saved', versionId: version.id, revision: version.revision };
    } catch (error) {
      if (error instanceof StoryboardSaveError) {
        if (error.reason === 'no_script' || error.reason === 'no_room') return { kind: error.reason };
        if (error.reason === 'no_place') return { kind: 'no_place', field: error.field ?? 'shots', shot: error.shot ?? 1 };
        return { kind: error.reason, field: error.field ?? 'shots' };
      }
      if (error instanceof ArtifactError && error.code === 'stale_revision') return { kind: 'stale' };
      if (error instanceof ArtifactError && error.code === 'not_found') return { kind: 'not_found' };
      if (error instanceof ArtifactError && error.code === 'invalid_input') return { kind: 'invalid', field: 'shots' };
      logFailure('Assistant storyboard save failed', error);
      return { kind: 'unavailable' };
    }
  };
}
