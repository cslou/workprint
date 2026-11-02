import { z } from 'zod';
import { makeSheet, sheetViewCap, sheetViewNameCap, type ImageFailure, type SheetOutcome } from '../../../application/index.js';
import { defineTool } from '../define.js';
import { imageFailure, imageSize } from '../image-shared.js';

type Refused = Extract<SheetOutcome, { kind: 'refused' }>['reason'];
type NotSaved = Extract<SheetOutcome, { kind: 'not_saved' }>['reason'];
/** Every reason a sheet wasn't made or saved: a refusal before any paid call, a view's failure, or the sheet save's. */
export type SheetReason = Refused | 'invalid' | 'too_long' | 'unrevisable' | 'in_other_sheet' | ImageFailure['reason'] | Exclude<NotSaved, 'unavailable'>;
type Missing = { view: string; reason: ImageFailure['reason']; message: string };
type SheetView = { view: string; versionId: string };
export type GenerateSheetResult =
  | { made: true; sheet: { versionId: string; label: string }; views: SheetView[]; given: number; landed: number; missing: Missing[] }
  | { made: false; reason: SheetReason; summary: string; message: string; kept?: SheetView[] };

const refusal = (reason: SheetReason, summary: string, message: string, kept?: SheetView[]): GenerateSheetResult => ({ made: false, reason, summary, message, ...(kept ? { kept } : {}) });

/** The line and the message for a refusal before any paid call. */
function before(reason: Refused): GenerateSheetResult {
  switch (reason) {
    case 'unsaveable': { const line = imageFailure({ reason }); return refusal(reason, line.summary, line.message); }
    case 'no_script': return refusal(reason, 'Not made: there is no script yet; write it first', 'Not made: this video has no script, and a sheet is for a subject the script lists. Write the script with update-script first. Nothing was sent.');
    case 'not_in_script': return refusal(reason, 'Not made: that subject isn’t in the script', 'Not made: subject is not a subject id from read-workspace. Pass one it lists, or add the subject to the script with update-script first. Nothing was sent.');
    case 'image_not_found': return refusal(reason, 'Not made: an image wasn’t found', 'Not made: identity or a view\'s image is not an image this video uses. Call read-workspace and pass only image versionIds it lists. Nothing was sent.');
    case 'too_many_views': return refusal(reason, `Not made: a sheet holds at most ${sheetViewCap} views`, `Not made: with the sheet's current views, this call would give it more than ${sheetViewCap} views. Redo views by their names, or ask the user which views to keep. Nothing was sent.`);
    case 'no_room': return refusal(reason, 'Not made: this video has too many saved items', 'Not made: this video has no room for these images and the sheet. Tell the user; do not retry. Nothing was sent.');
    case 'work_unavailable': return refusal(reason, 'Not made: saved work is unavailable', 'Not made: saved work could not be reached, so nothing was sent to Meta. Tell the user; do not retry in this turn.');
  }
}

/** The line and the message when made views were kept as draft images but the sheet wasn't saved. */
function unsaved(outcome: Extract<SheetOutcome, { kind: 'not_saved' }>): GenerateSheetResult {
  const kept = outcome.kept, ids = kept.length ? ` The views were kept as draft images: ${kept.map(view => `${view.view} (${view.versionId})`).join(', ')}; call again with each as a view's image to put them in the sheet.` : '';
  switch (outcome.reason) {
    case 'stale': return refusal('stale', 'Not saved: the sheet changed; views kept as images', `Not saved: the sheet changed while the views were being made.${ids}`, kept);
    case 'not_in_script': return refusal('not_in_script', 'Not saved: the subject left the script; views kept', `Not saved: the subject is no longer in the script.${ids} Ask the user before adding it back.`, kept);
    case 'not_found': return refusal('not_found', 'Not saved: an image wasn’t found; views kept as images', `Not saved: an image in the sheet is no longer one this video uses.${ids}`, kept);
    case 'invalid': return refusal('invalid', 'Not saved: the sheet wasn’t valid; views kept as images', `Not saved: the sheet's text or views were refused.${ids}`, kept);
    case 'in_other_sheet': return refusal('in_other_sheet', `Not saved: an image is already in ${outcome.subjectName ?? 'another'}’s sheet`, `Not saved: an image is already in another subject's sheet.${ids}`, kept);
    case 'no_room': return refusal('no_room', 'Not saved: this video has too many saved items', `Not saved: this video ran out of room for the sheet.${ids}`, kept);
    case 'unavailable': return refusal('not_saved', 'Not saved: the sheet couldn’t be saved', `Not saved: saving the sheet is unavailable right now. Tell the user; do not retry in this turn.${ids}`, kept);
  }
}

/** The line and the message the model can follow, for every outcome but a saved sheet. */
function refused(outcome: Exclude<SheetOutcome, { kind: 'saved' }>): GenerateSheetResult {
  switch (outcome.kind) {
    case 'refused': return before(outcome.reason);
    case 'invalid': return refusal('invalid', 'Not made: the sheet wasn’t valid (views)', 'Not made: each view needs a name and either an image or a prompt, and two views can\'t share a name or an image. Fix views and try once more. Nothing was sent.');
    case 'too_long': return refusal('too_long', `Not made: ${outcome.subjectName}’s sheet has over ${sheetViewCap} views; trim it first`, `Not made: ${outcome.subjectName}'s sheet has more than ${sheetViewCap} views, so it can't be changed here. Ask the user to remove views in Assets first. Nothing was sent.`);
    case 'unrevisable': return refusal('unrevisable', `Not made: ${outcome.subjectName}’s sheet can’t be changed here`, `Not made: a view in ${outcome.subjectName}'s sheet has a name longer than ${sheetViewNameCap} characters, so it can't be changed here. Ask the user to rename that view in Assets first. Nothing was sent.`);
    case 'in_other_sheet': return refusal('in_other_sheet', `Not made: that image is already in ${outcome.subjectName}’s sheet`, `Not made: a view's image is already in ${outcome.subjectName}'s sheet, and an image is in one sheet only. ${outcome.passed ? 'Make a new view instead.' : 'This sheet already shares it, so ask the person to remove it from one of the sheets in Assets.'} Nothing was sent.`);
    case 'view_failed': { const failure = imageFailure(outcome.failure); return refusal(outcome.failure.reason, failure.summary, `${failure.message} No sheet was saved.`); }
    case 'not_saved': return unsaved(outcome);
  }
}

/** Text the saved sheet needs: not empty once trimmed, so a paid view is never lost to a blank field. */
const filled = (max: number) => z.string().min(1).max(max).refine(text => text.trim().length > 0, 'The text is empty');
const notes = (min: number) => z.array(filled(200)).min(min).max(10);

const view = z.strictObject({
  view: filled(sheetViewNameCap).describe('The view\'s name, for example "Face close-up" or "Wide master".'),
  prompt: z.string().max(8000).default('').describe('One pose or angle to make; empty when image is set.'),
  image: z.string().max(200).default('').describe('An image versionId from read-workspace to use as this view instead of making one; empty to make it.'),
  notes: notes(0).default([]).describe('Short notes about this view.'),
  size: imageSize.default('auto').describe('"auto" or WxH, which sets the shape, not exact pixels.'),
});

/** Makes a script subject's reference sheet with Meta, one view per image, and saves it as the subject's draft sheet. */
export const generateSheetTool = defineTool({
  id: 'generate-sheet',
  description: [
    'Make or extend the reference sheet of one subject the script lists (subject is its id from read-workspace), and save it as that subject\'s draft sheet; each made view is also saved as a draft image. Saving is never approval: the user approves sheets and images.',
    'A sheet is a light set of separate images, one view per image on a plain background, each usable alone. Make at most 5 views per call, and a sheet holds at most 5 in all.',
    'Suggested views: a character 3 to 4 (full-body front, three-quarter or side, face close-up, and optionally one wardrobe or prop detail); a place 2 to 3 (wide master, reverse angle, and optionally one zone or detail); a prop 1 to 2 (product view, and optionally its other state).',
    'Write each view\'s prompt as one pose or angle; the server adds the subject, description and continuity notes, and keeps every view consistent with one identity image.',
    'Set identity to a photo of the subject the user gave, so every view keeps it. Set a view\'s image to put an existing image into the sheet instead of making one.',
    'When the subject already has a sheet, call again with a view\'s name to redo that view, or a new name to add one; the other views stay.',
    'Each made view is a paid image. Make one call per sheet the user asked for.',
  ].join(' '),
  inputSchema: z.strictObject({
    subject: z.string().min(1).max(200).describe('The subject\'s id from read-workspace subjects.'),
    description: filled(2000).describe('What the subject looks like, in a few sentences.'),
    continuityNotes: notes(1).describe('What every view must keep, 1 to 10 short notes.'),
    views: z.array(view).min(1).max(sheetViewCap).describe('The views to make or put in the sheet, in order.'),
    identity: z.string().max(200).default('').describe('An image versionId the views keep, such as a photo the user gave; empty for none.'),
  }),
  phrase: 'Making a reference sheet…',
  // A refusal still finishes the line. Mastra hands back an input validation failure as `{ error: true }`.
  doneSummary: (result: GenerateSheetResult | { error: true }) => {
    if ('error' in result) return 'Not made: the sheet wasn’t valid';
    if (!result.made) return result.summary;
    return result.landed < result.given ? `Saved ${result.sheet.label} · ${result.landed} of ${result.given} views` : `Saved ${result.sheet.label}`;
  },
  shownMedia: (result: GenerateSheetResult | { error: true }) => 'made' in result && result.made ? result.views.map(item => ({ kind: 'image', versionId: item.versionId })) : [],
  execute: async (input, context): Promise<GenerateSheetResult> => {
    const { scope, collaborators, signal } = context;
    const outcome = await makeSheet(collaborators, scope.accountId, scope.videoId, input, { signal });
    if (outcome.kind !== 'saved') return refused(outcome);
    return {
      made: true, sheet: { versionId: outcome.versionId, label: `${outcome.subjectName} · Version ${outcome.revision}` }, views: outcome.views, given: outcome.given, landed: outcome.landed,
      missing: outcome.missing.map(item => ({ view: item.view, reason: item.reason, message: imageFailure(item).message })),
    };
  },
});
