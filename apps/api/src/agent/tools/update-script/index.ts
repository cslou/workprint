import { z } from 'zod';
import { savedScriptContentSchema } from '@workprint/contracts';
import { defineTool, type ToolContext } from '../define.js';

type UpdateScriptResult =
  | { saved: true; versionId: string; version: number }
  | { saved: false; reason: 'stale' | 'not_found' | 'invalid' | 'unavailable'; message: string };

const messages = {
  stale: 'Not saved: the script changed since you read it. Call read-workspace, then redo the change on the current script version.',
  not_found: 'Not saved: baseVersionId is not this video\'s current script. Call read-workspace for the current versionId, or pass null only when the video has no script.',
  invalid: 'Not saved: the script is not valid. Check that every speaker is listed in characters unless the line is voice-over.',
  unavailable: 'Not saved: saving is unavailable right now. Tell the user and do not retry in this turn.',
} as const;
const summaries = { stale: 'Not saved: the script changed', not_found: 'Not saved: script not found', invalid: 'Not saved: the script isn’t valid', unavailable: 'Not saved: saving is unavailable' } as const;

/** A wrong base gets the concrete recovery for this run's own video: null when it has no script, else the current versionId. */
async function notFoundMessage(collaborators: ToolContext['collaborators'], scope: ToolContext['scope']): Promise<string> {
  const read = await collaborators.readWorkspace(scope.accountId, scope.videoId);
  if (read.kind !== 'found') return messages.not_found;
  const script = read.workspace.script;
  if (!script) return 'Not saved: this video has no script yet. Call update-script again now with baseVersionId null (JSON null, not a string) and the same script.';
  return `Not saved: baseVersionId is not this video's current script. The current script is version ${script.version.revision}, versionId "${script.version.id}". Call read-workspace, then redo your change on that version and save it with that baseVersionId.`;
}

/** Saves the video's script as a new version that becomes the current script, for the run's own account and video. */
export const updateScriptTool = defineTool({
  id: 'update-script',
  description: [
    'Save the script for this video. Send the complete script: it becomes the current script as a new version, and earlier versions stay in the version history.',
    'Pass baseVersionId: the versionId of the current script from read-workspace, or JSON null (not a string) when the video has no script yet. If a save is refused, follow the result message: it names the exact baseVersionId to use next.',
    'A script has exactly one scene. Write only what the audience can see or hear, in story order, with action and dialogue interleaved as they happen.',
    'Turn narration and inner thought into visible action, dialogue or voice-over, or leave them out. List in characters everyone physically present in the scene.',
    'Every speaker must be in characters, except a voice-over speaker who is absent. Set delivery only to voice_over or off_screen when the story needs it.',
    'Do not include shots, camera directions, storyboard panels, image prompts or timing.',
  ].join(' '),
  inputSchema: z.strictObject({
    baseVersionId: z.string().min(1).max(200).nullable().describe('The current script versionId from read-workspace, or JSON null when the video has no script yet.'),
    script: savedScriptContentSchema.describe('The complete script, with schemaVersion 1 and exactly one scene.'),
  }),
  phrase: 'Updating the script…',
  // A refusal still finishes the line. Mastra hands back an input validation failure as `{ error: true }`.
  doneSummary: (result: UpdateScriptResult | { error: true }) => 'error' in result ? summaries.invalid : result.saved ? `Saved version ${result.version}` : summaries[result.reason],
  execute: async (input, { scope, collaborators }): Promise<UpdateScriptResult> => {
    const outcome = await collaborators.saveScript(scope.accountId, scope.videoId, { content: input.script, baseVersionId: input.baseVersionId });
    if (outcome.kind === 'saved') return { saved: true, versionId: outcome.versionId, version: outcome.revision };
    return { saved: false, reason: outcome.kind, message: outcome.kind === 'not_found' ? await notFoundMessage(collaborators, scope) : messages[outcome.kind] };
  },
});
