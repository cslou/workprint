import { z } from 'zod';
import { shotDurationSchema, shotDurations, shotPositionLength, shotRoles } from '@workprint/contracts';
import { optionalId, type AssistantStoryboardOutcome } from '../../../application/index.js';
import { defineTool } from '../define.js';

type Refusal = Exclude<AssistantStoryboardOutcome['kind'], 'saved'>;
export type SaveStoryboardResult =
  | { saved: true; versionId: string; version: number }
  | { saved: false; reason: Refusal; message: string; field?: string };

/** The done line for each refusal, within the activity line's 60 characters. */
const summaries: Record<Refusal, string> = {
  no_script: 'Not saved: there is no script yet',
  stale: 'Not saved: the storyboard changed since you read it',
  not_found: 'Not saved: that storyboard wasn’t found',
  not_in_script: 'Not saved: a subject isn’t in the script; add it first',
  role: 'Not saved: a subject’s role doesn’t match its kind',
  no_place: 'Not saved: a Shot names no place',
  invalid: 'Not saved: the storyboard wasn’t valid',
  no_room: 'Not saved: this video has too many saved items',
  unavailable: 'Not saved: saved work is unavailable',
};

/** What the model is told for each refusal, naming the field at fault when there is one. */
function message(outcome: Exclude<AssistantStoryboardOutcome, { kind: 'saved' }>): string {
  switch (outcome.kind) {
    case 'no_script': return 'Not saved: this video has no script yet. Write it with update-script first.';
    case 'stale': return 'Not saved: the storyboard changed since you read it. Call read-workspace, then redo the change on the current storyboard version.';
    case 'not_found': return 'Not saved: base is not this video\'s storyboard. Call read-workspace and pass the storyboard\'s versionId, or empty when the video has none.';
    case 'not_in_script': return `Not saved: ${outcome.field} is not a subject the script lists. Use a subject id from read-workspace, or add the subject to the script with update-script first.`;
    case 'role': return `Not saved: ${outcome.field} doesn't fit the subject's kind. identity is for a character, environment for a place, prop for a prop, and composition for any.`;
    case 'no_place': return `Not saved: Shot ${outcome.shot} names no place. Add the place it happens in to its references, with the environment role.`;
    case 'invalid': return `Not saved: ${outcome.field} is not valid. A kept shotId or panelId must be one from the current storyboard, under its own Shot, and a speaker must be a character in the scene unless voice_over. Fix it and try once more.`;
    case 'no_room': return 'Not saved: this video has too many saved items. Tell the user; do not retry.';
    case 'unavailable': return 'Not saved: saving is unavailable right now. Tell the user and do not retry in this turn.';
  }
}

const deliveries = ['voice_over', 'off_screen'] as const;
/** Optional text from the model: empty, whitespace or "null" means none. */
const optional = (value: string) => optionalId(value) || undefined;
const filled = (max: number) => z.string().min(1).max(max).refine(text => text.trim().length > 0, 'The text is empty');

const line = z.strictObject({
  character: filled(200).describe('The speaker, as the script names them.'),
  text: filled(2000).describe('The words spoken.'),
  delivery: z.string().max(20).default('').describe('"voice_over" for voice-over or narration, "off_screen" for a character heard but not seen, or empty when spoken on screen.'),
});
const reference = z.strictObject({
  subjectId: z.string().min(1).max(200).describe('A subject id from read-workspace.'),
  role: z.enum(shotRoles).describe('identity for a character, environment for a place, prop for a prop, composition for any.'),
  purpose: filled(120).describe('This sheet\'s one job in the Shot, in one line.'),
});
const positions = z.strictObject({
  start: filled(shotPositionLength).describe('Where each person and key object is in the frame as the Shot starts, and which way they face or move.'),
  end: filled(shotPositionLength).describe('Where they are as the Shot ends.'),
});
const panel = z.strictObject({
  panelId: z.string().max(200).default('').describe('The panel\'s id from read-workspace; empty for a new panel.'),
  description: filled(2000).describe('What the panel shows.'),
});
const shot = z.strictObject({
  shotId: z.string().max(200).default('').describe('The Shot\'s id from read-workspace; empty for a new Shot.'),
  intent: filled(2000).describe('The Shot\'s purpose in the story.'),
  framing: z.string().max(80).default('').describe('For example wide, medium, close or insert.'),
  action: z.string().max(2000).default('').describe('What visibly happens, including any context.'),
  dialogue: z.array(line).max(20).default([]).describe('The script\'s lines spoken in this Shot, in order.'),
  cameraNote: z.string().max(2000).default('').describe('Shot size, angle and at most one movement.'),
  references: z.array(reference).max(10).default([]).describe('The subjects whose sheets this Shot uses, each once.'),
  durationS: shotDurationSchema.describe(`How long the Shot runs, in whole seconds, ${shotDurations.min} to ${shotDurations.max}; its video is made at this length.`),
  positions: positions.describe('Where people and key objects start and end in the frame, in frame-left and frame-right terms.'),
  panels: z.array(panel).min(1).max(2).describe('1 key panel, or 2 only when the picture changes a lot within the Shot.'),
});

/** Saves the video's storyboard from its current script as a new draft version, for the run's own account and video. */
export const saveStoryboardTool = defineTool({
  id: 'save-storyboard',
  description: [
    'Save the storyboard for this video: the Shots that tell the current script, in story order. It becomes the current storyboard as a draft version; saving is never approval.',
    'Pass base: the storyboard\'s versionId from read-workspace, or empty when the video has no storyboard yet. Send every Shot in full each time: a Shot left out is dropped, so read the storyboard in full (read-workspace with its versionId) before changing it. If a save is refused, follow the result message.',
    `Read the whole script first. A Shot is one camera set-up: start a new Shot only when the camera set-up changes (a new angle or shot size) or time or place jumps. Every Shot is a cut to a different camera: if two Shots in a row would share a camera set-up, make them one Shot. Continuous action in one space stays in one Shot, up to ${shotDurations.max} seconds. Use as few Shots as tell the script clearly.`,
    'Give each Shot its intent, framing, action, the script\'s dialogue spoken in it with each line\'s delivery, and a camera note: shot size, angle and at most one movement, for example "Medium, from her left, camera slowly follows her". Context goes in action, never in dialogue.',
    'Give each Shot its positions: start and end say where each person and key object is in the frame and which way they face or move, in frame-left and frame-right terms, and which side the camera is on, for example start "Mara enters frame left, walking toward frame right; the bench is frame right" and end "Mara kneels at the bench, frame right, facing the camera". When the action continues from the previous Shot, its start follows from that Shot\'s end.',
    'A Shot has one key panel. Add a second only when the picture changes a lot within the Shot, for example when the camera moves from one part of the room to another, or from wide to close. Never add one for a small change of pose or expression.',
    'A Shot\'s video is made from its sheets and its first and last panels, which set the framing.',
    'Name each Shot\'s sheets in references: a subject the script lists, with one role and one job each. When the script lists a place, every Shot names the place it happens in with the environment role, even a close-up.',
    `Give each Shot its length in durationS, ${shotDurations.min} to ${shotDurations.max} seconds: about 2.5 spoken words per second of its dialogue, plus the time its action needs, with a beat of silence at each end, rounded up to a whole second. When the user asks for a total length, make the Shots' lengths add up to about that total, each still ${shotDurations.min} to ${shotDurations.max} seconds; if the script's dialogue and action can't fit it, tell the user and suggest a total or number of Shots that can.`,
    'read-workspace shows each Shot\'s current length, and the user can change it. A save sets the length you send, so send back the length a Shot already has unless the user asks you to change it.',
    'Keep each Shot\'s shotId and each panel\'s panelId from read-workspace so their images and videos stay; leave them empty for new ones.',
    'Show the user the Shot plan before making panels.',
  ].join(' '),
  inputSchema: z.strictObject({
    base: z.string().max(200).default('').describe('The storyboard\'s versionId from read-workspace, or empty when the video has no storyboard yet.'),
    shots: z.array(shot).min(1).max(100).describe('Every Shot, in story order.'),
  }),
  phrase: 'Saving the storyboard…',
  // A refusal still finishes the line. Mastra hands back an input validation failure as `{ error: true }`.
  doneSummary: (result: SaveStoryboardResult | { error: true }) => 'error' in result ? summaries.invalid : result.saved ? `Saved Storyboard · Version ${result.version}` : summaries[result.reason],
  execute: async (input, { scope, collaborators }): Promise<SaveStoryboardResult> => {
    const shots = input.shots.map(given => {
      const framing = optional(given.framing), action = optional(given.action), cameraNote = optional(given.cameraNote);
      return {
        shotId: optionalId(given.shotId), intent: given.intent, durationS: given.durationS, positions: { start: given.positions.start, end: given.positions.end },
        ...(framing ? { framing } : {}), ...(action ? { action } : {}), ...(cameraNote ? { cameraNote } : {}),
        // An unknown delivery is a line spoken on screen.
        ...(given.dialogue.length ? { dialogue: given.dialogue.map(spoken => {
          const delivery = deliveries.find(kind => kind === optionalId(spoken.delivery));
          return { character: spoken.character, text: spoken.text, ...(delivery ? { delivery } : {}) };
        }) } : {}),
        ...(given.references.length ? { references: given.references.map(item => ({ ...item, subjectId: item.subjectId.trim() })) } : {}),
        panels: given.panels.map(item => ({ panelId: optionalId(item.panelId), description: item.description })),
      };
    });
    const outcome = await collaborators.saveStoryboard(scope.accountId, scope.videoId, { baseVersionId: optionalId(input.base) || null, shots });
    if (outcome.kind === 'saved') return { saved: true, versionId: outcome.versionId, version: outcome.revision };
    return { saved: false, reason: outcome.kind, message: message(outcome), ...('field' in outcome ? { field: outcome.field } : {}) };
  },
});
