import { z } from 'zod';
import { makePanel, maxPanelInputs, optionalId, type PanelOutcome } from '../../../application/index.js';
import { videoFrameRatio } from '../../../generation/index.js';
import { defineTool } from '../define.js';
import { imageFailure, imageSize, type ImageFailure } from '../image-shared.js';

type Refused = Extract<PanelOutcome, { kind: 'refused' }>['reason'];
/** Every reason a panel wasn't made or kept: a refusal before any paid call, Meta's or the save's failure, or no room left. */
export type PanelReason = Refused | 'subject_gone' | 'too_many' | 'not_kept' | ImageFailure['reason'];
export type GeneratePanelResult =
  /** `gone`: the panel left the storyboard while the image was made, so it was saved as a plain draft image. */
  | { made: true; versionId: string; label?: string; gone: boolean }
  | { made: false; reason: PanelReason; summary: string; message: string };

const refusal = (reason: PanelReason, summary: string, message: string): GeneratePanelResult => ({ made: false, reason, summary, message });

/** The line and the message for a refusal before any paid call. */
function before(reason: Refused): GeneratePanelResult {
  switch (reason) {
    case 'unsaveable': { const line = imageFailure({ reason }); return refusal(reason, line.summary, line.message); }
    case 'not_found': return refusal(reason, 'Not made: that panel wasn’t found', 'Not made: shot and panel must be a Shot id and one of its panel ids from read-workspace\'s storyboard. Call read-workspace and try once more. Nothing was sent.');
    case 'needs_first_panel': return refusal(reason, 'Not made: make the first panel first', 'Not made: a Shot\'s later panel is made from its first panel\'s image, and the first panel has none yet. Make the first panel first. Nothing was sent.');
    case 'image_not_found': return refusal(reason, 'Not made: an input image wasn’t found', 'Not made: an image in images is not one this video uses. Call read-workspace and pass only image versionIds it lists. Nothing was sent.');
    case 'no_room': return refusal(reason, 'Not made: this video has too many saved items', 'Not made: this video has no room for another panel image. Tell the user; do not retry. Nothing was sent.');
    case 'work_unavailable': return refusal(reason, 'Not made: saved work is unavailable', 'Not made: saved work could not be reached, so nothing was sent to Meta. Tell the user; do not retry in this turn.');
  }
}

/** The line and the message the model can follow, for every outcome but a saved panel. */
function refused(outcome: Exclude<PanelOutcome, { kind: 'saved' }>): GeneratePanelResult {
  switch (outcome.kind) {
    case 'refused': return before(outcome.reason);
    case 'subject_gone': return refusal('subject_gone', `Not made: ${outcome.subjectName} left the script; update the storyboard`, `Not made: the Shot names ${outcome.subjectName}, who is no longer in the script. Save the storyboard again without that subject, or ask the user to add it back to the script. Nothing was sent.`);
    case 'too_many': return refusal('too_many', `Not made: too many input images (${outcome.count}); choose fewer images`, `Not made: with the first panel's image and the Shot's sheets this panel has ${outcome.count} inputs, and Meta takes at most ${maxPanelInputs}. Pick only the views this panel needs in images. Nothing was sent.`);
    case 'failed': { const line = imageFailure(outcome.failure); return refusal(outcome.failure.reason, line.summary, line.message); }
    case 'not_kept': return refusal('not_kept', 'Not saved: this video has too many saved items', 'Not saved: Meta made the image, but the video ran out of room for it while it was made, so it was not kept. Tell the user; do not retry.');
  }
}

// A panel becomes a Shot video's frame, so its shape stays strictly inside MiniMax's frame ratio: Meta keeps the
// shape it is asked for but picks the pixels, and rounding at an exact limit could tip it over. Checked on every
// call, though a later panel's size is ignored. "auto" leaves the shape to Meta.
const panelSize = imageSize.refine(value => {
  if (value === 'auto') return true;
  const [width, height] = value.split('x').map(Number) as [number, number];
  return width / height > videoFrameRatio.min && width / height < videoFrameRatio.max;
}, `A panel's shape must be "auto" or WxH with width ÷ height above ${videoFrameRatio.min} and below ${videoFrameRatio.max}, so it can be a Shot video's frame`);

/** Makes one panel's image with Meta from the Shot's sheets and saves it as the next version of that panel's image. */
export const generatePanelTool = defineTool({
  id: 'generate-panel',
  description: [
    'Make one storyboard panel\'s image with Meta, from the Shot\'s reference sheets, and save it as that panel\'s next draft image. Saving is never approval: the user chooses panels.',
    'shot and panel are ids from read-workspace\'s storyboard. Make a Shot\'s first panel before its second: the server puts the first panel\'s image first, keeps its camera, setting and staging, and gives the second the same size so both frames match.',
    'Pick only the images this panel needs in images, as an artist would: usually the relevant views of the sheets the Shot names (a face close-up for a close shot, a wide master for the place), not whole sheets; other images the video uses, such as one in a character\'s group, only when the user asks. Empty images passes every sheet the Shot names, whole. The server orders and labels the inputs and tells Meta what each is for.',
    'Write the prompt from the Shot as three short parts: Preserve (camera, crop, staging, setting, each character\'s look and clothing, and how many of each prop there are, as the inputs show them), Change only (this panel\'s one action, pose, expression or camera change), and Reject if (camera drift, changed clothing or faces, moved furniture, duplicate or missing props, extra people).',
    'Show one visible moment. Do not invent story facts or force a style. Each call is one paid image.',
  ].join(' '),
  inputSchema: z.strictObject({
    shot: z.string().min(1).max(200).describe('The Shot\'s id from read-workspace\'s storyboard.'),
    panel: z.string().min(1).max(200).describe('The panel\'s id under that Shot.'),
    prompt: z.string().min(1).max(32000).refine(text => text.trim().length > 0, 'The prompt is empty').describe('Preserve, Change only and Reject if, from the Shot.'),
    // More than Meta takes is accepted here, so the model is told the count rather than that its call was invalid.
    images: z.array(z.string().max(200)).max(maxPanelInputs * 2).default([]).describe('Image versionIds from read-workspace this panel is made from; empty for every sheet the Shot names.'),
    size: panelSize.default('auto').describe(`"auto" or WxH, width ÷ height above ${videoFrameRatio.min} and below ${videoFrameRatio.max} on every call, for a Shot's first panel; a later panel takes the first panel's size.`),
  }),
  phrase: 'Making a panel…',
  // A refusal still finishes the line. Mastra hands back an input validation failure as `{ error: true }`.
  doneSummary: (result: GeneratePanelResult | { error: true }) => {
    if ('error' in result) return imageFailure({ reason: 'invalid' }).summary;
    if (!result.made) return result.summary;
    if (result.gone) return `Saved ${result.label ?? 'an image'} (its panel is gone)`;
    return result.label ? `Saved ${result.label}` : 'Saved the panel';
  },
  shownMedia: (result: GeneratePanelResult | { error: true }) => 'made' in result && result.made ? [{ kind: 'image', versionId: result.versionId }] : [],
  execute: async (input, context): Promise<GeneratePanelResult> => {
    const { scope, collaborators, signal } = context;
    // An empty or "null" id names no image.
    const images = input.images.map(optionalId).filter(Boolean);
    const outcome = await makePanel(collaborators, scope.accountId, scope.videoId, { shot: input.shot.trim(), panel: input.panel.trim(), images, prompt: input.prompt, size: input.size }, { signal });
    if (outcome.kind !== 'saved') return refused(outcome);
    return { made: true, versionId: outcome.versionId, gone: outcome.gone, ...(outcome.label ? { label: outcome.label } : {}) };
  },
});
