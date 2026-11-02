import { z } from 'zod';
import { scriptBodySchema, subjectKinds } from '@workprint/contracts';
import { defineTool } from '../define.js';

type UpdateScriptResult =
  | { saved: true; versionId: string; version: number }
  | { saved: false; reason: 'stale' | 'not_found' | 'invalid' | 'subjects_differ' | 'unavailable'; message: string };

const messages = {
  stale: 'Not saved: the script changed since you read it. Call read-workspace, then redo the change on the current script version.',
  not_found: 'Not saved: baseVersionId is not this video\'s current script. Call read-workspace, then redo the change on the current script version and pass its versionId.',
  invalid: 'Not saved: the script is not valid. Every speaker must be a character subject unless voice-over, and subject names must be distinct.',
  unknown_subject: 'Not saved: a subject id is not in the current script, or is listed twice. Keep each subject\'s id from read-workspace once, and leave id empty for a new subject.',
  subjects_differ: 'Not saved: the characters and subjects differ; pass the full subjects list.',
  unavailable: 'Not saved: saving is unavailable right now. Tell the user and do not retry in this turn.',
} as const;
const summaries = { stale: 'Not saved: the script changed', not_found: 'Not saved: script not found', invalid: 'Not saved: the script isn’t valid', subjects_differ: 'Not saved: the characters and subjects differ', unavailable: 'Not saved: saving is unavailable' } as const;

const subject = z.strictObject({
  id: z.string().max(200).default('').describe('The subject\'s id from read-workspace; empty for a new subject.'),
  kind: z.enum(subjectKinds).describe('character, place or prop.'),
  name: z.string().min(1).max(80).describe('The name the script uses.'),
});

/** Saves the video's script as a new version that becomes the current script, for the run's own account and video. */
export const updateScriptTool = defineTool({
  id: 'update-script',
  description: [
    'Save the script for this video. Send the complete script: it becomes the current script as a new version, and earlier versions stay in the version history.',
    'Pass baseVersionId: the versionId of the current script from read-workspace, or null when the video has no script yet (the first save ignores it). If a save is refused, follow the result message.',
    'A script has exactly one scene. Write only what the audience can see or hear, in story order, with action and dialogue interleaved as they happen.',
    'Turn narration and inner thought into visible action, dialogue or voice-over, or leave them out. List in characters everyone physically present in the scene.',
    'Every speaker must be in characters, except a voice-over speaker who is absent. Set delivery only to voice_over or off_screen when the story needs it.',
    'List as subjects every character, place and prop that will need a look; list a prop only when it matters visually. The character subjects become the scene\'s characters.',
    'Keep each subject\'s id from read-workspace, also when renaming it; leave id empty for a new subject. Pass the full list to change it, or an empty list to keep the current subjects.',
    'Add a new subject here before anything is made for it.',
    'Do not include shots, camera directions, storyboard panels, image prompts or timing.',
  ].join(' '),
  inputSchema: z.strictObject({
    baseVersionId: z.string().min(1).max(200).nullable().describe('The current script versionId from read-workspace, or null when the video has no script yet.'),
    script: scriptBodySchema.describe('The complete script, with schemaVersion 1 and exactly one scene.'),
    subjects: z.array(subject).max(50).default([]).describe('Every character, place and prop of the script; empty to keep the current subjects.'),
  }),
  phrase: 'Updating the script…',
  // A refusal still finishes the line. Mastra hands back an input validation failure as `{ error: true }`.
  doneSummary: (result: UpdateScriptResult | { error: true }) => 'error' in result ? summaries.invalid : result.saved ? `Saved version ${result.version}` : summaries[result.reason],
  execute: async (input, { scope, collaborators }): Promise<UpdateScriptResult> => {
    // Models send "null" for an id they leave out: it means a new subject, as empty does.
    const subjects = input.subjects.map(subject => subject.id.trim().toLowerCase() === 'null' ? { ...subject, id: '' } : subject);
    const outcome = await collaborators.saveScript(scope.accountId, scope.videoId, { content: input.script, baseVersionId: input.baseVersionId, subjects });
    if (outcome.kind === 'saved') return { saved: true, versionId: outcome.versionId, version: outcome.revision };
    if (outcome.kind === 'invalid' && outcome.field === 'subjects') return { saved: false, reason: 'invalid', message: messages.unknown_subject };
    return { saved: false, reason: outcome.kind, message: messages[outcome.kind] };
  },
});
