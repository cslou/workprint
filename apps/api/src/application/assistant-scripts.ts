import { ArtifactError, ScriptSubjectsError, type AssistantScriptInput, type AssistantScriptSave } from '../artifacts/index.js';

/** What a script save by the assistant did; never an approval, and never says whether another account's video exists. */
export type AssistantScriptOutcome =
  | { kind: 'saved'; versionId: string; revision: number }
  | { kind: 'stale' } | { kind: 'not_found' } | { kind: 'invalid'; field?: 'subjects' } | { kind: 'subjects_differ' } | { kind: 'unavailable' };
/** Account and video come from trusted server context (an admitted native run), never from model arguments. */
export type SaveAssistantScript = (accountId: string, videoId: string, input: AssistantScriptInput) => Promise<AssistantScriptOutcome>;

const outcomes = { stale_revision: 'stale', not_found: 'not_found', invalid_input: 'invalid' } as const;

/** In-process script saves for agent tools, over the assistant-only artifact capability. */
export function createAssistantScriptSaver(save: (account: string, conversation: string, input: AssistantScriptInput) => Promise<AssistantScriptSave>): SaveAssistantScript {
  return async (accountId, videoId, input) => {
    try {
      const { version } = await save(accountId, videoId, input);
      return { kind: 'saved', versionId: version.id, revision: version.revision };
    } catch (error) {
      if (error instanceof ScriptSubjectsError) return error.reason === 'differ' ? { kind: 'subjects_differ' } : { kind: 'invalid', field: 'subjects' };
      if (error instanceof ArtifactError && error.code in outcomes) return { kind: outcomes[error.code as keyof typeof outcomes] };
      console.error('Assistant script save failed', { name: error instanceof Error ? error.name : 'unknown', ...(error instanceof ArtifactError ? { code: error.code } : {}) });
      return { kind: 'unavailable' };
    }
  };
}
