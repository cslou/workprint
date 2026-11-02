import { z } from 'zod';
import { MetaImageError, type ImageResult } from '../../../generation/index.js';
import { defineTool, type ToolContext } from '../define.js';
import { workspaceItem } from '../read-workspace/projection.js';

/** One saved image, named as read-workspace names it; the name is left out when the workspace can't be read. */
type SavedImage = { versionId: string; label?: string; width: number; height: number };
type Reason = 'content_policy' | 'input_not_found' | 'unavailable' | 'checks' | 'not_saved' | 'invalid';
export type GenerateImageResult =
  | { made: true; images: SavedImage[]; failed: number; showInChat: boolean }
  | { made: false; reason: Reason; message: string };

const maxRatio = 16;
/** "auto", or "WxH" within Meta's ratio limit. The long side is guidance, not a rule: Meta picks the pixels. */
const size = z.string().regex(/^(auto|\d{2,5}x\d{2,5})$/).refine(value => {
  if (value === 'auto') return true;
  const [width, height] = value.split('x').map(Number) as [number, number];
  return width > 0 && height > 0 && Math.max(width, height) / Math.min(width, height) <= maxRatio;
}, 'The shape must be "auto" or WxH with a ratio of 16 or less');

const summaries: Readonly<Record<Reason, string>> = {
  content_policy: 'Not made: the request was refused',
  input_not_found: 'Not made: an input image wasn’t found',
  unavailable: 'Not made: Meta is unavailable',
  checks: 'Not saved: the image didn’t pass checks',
  not_saved: 'Not saved: the image couldn’t be stored',
  invalid: 'Not made: the request wasn’t valid',
};
const messages: Readonly<Record<Exclude<Reason, 'invalid'>, string>> = {
  content_policy: 'Not made: Meta refused this request under its content policy. Rephrase the prompt without the refused content, or ask the user how to change it.',
  input_not_found: 'Not made: an input image is not one this video uses. Call read-workspace and pass only image versionIds it lists.',
  unavailable: 'Not made: Meta image generation is unavailable right now. Tell the user; do not retry more than once in this turn.',
  checks: 'Not saved: the image Meta returned did not pass the media checks. Tell the user; you may try once more with a different size.',
  not_saved: 'Not saved: Meta made the image but saving is unavailable right now. Tell the user and do not retry in this turn.',
};
const refusal = (reason: Reason, param?: string): GenerateImageResult => ({ made: false, reason,
  message: reason === 'invalid' ? `Not made: Meta found the request invalid${param ? ` (${param})` : ''}. Fix that field and try once more.` : messages[reason] });

/** Names each saved image as read-workspace does, so the model and the user see the same name. */
async function labelled(context: ToolContext, saved: Omit<SavedImage, 'label'>[]): Promise<SavedImage[]> {
  const read = saved.length ? await context.collaborators.readWorkspace(context.scope.accountId, context.scope.videoId) : undefined;
  return saved.map(image => {
    const label = read?.kind === 'found' ? workspaceItem(read.workspace, image.versionId)?.name : undefined;
    return label ? { ...image, label } : image;
  });
}

/** Makes images with Meta, optionally from the video's saved images, and saves each as the video's draft image. */
export const generateImageTool = defineTool({
  id: 'generate-image',
  description: [
    'Make one or more images with Meta and save each one as a draft image of this video. Saving is never approval: the user approves images.',
    'With no inputImages it generates from the prompt alone. With inputImages (versionIds of images from read-workspace) it edits or builds on those images.',
    'Before calling, write a short brief for yourself: the purpose (portrait, character, prop, environment or storyboard panel), the medium, the subject and the one moment the still must show, its framing, and what each input image is for.',
    'Show one visible moment, not a sequence of actions. Settle gaze, which way people and objects face, contact and grip, and how many of each object there are.',
    'Write a compact prompt from the blocks that apply, and leave out the rest: intent and constraints; what each input image is for; composition and visible state; what to preserve and what to change, when editing; one quality focus; relevant appearance; what to avoid.',
    'Then critique and simplify it: remove details the user did not ask for, repetition and contradictions, but keep every requirement. Do not invent story facts or force a style such as photorealism. Ask the user first only if a missing choice would change the image materially.',
    'size sets the shape, not exact pixels: "auto", or WxH such as 1536x1024. Keep the long side at 2048 or less.',
    'Set showInChat to true when the user asked for an image directly, so it is shown in the chat.',
  ].join(' '),
  inputSchema: z.strictObject({
    prompt: z.string().min(1).max(32000).refine(text => text.trim().length > 0, 'The prompt is empty').describe('The compact image prompt.'),
    inputImages: z.array(z.string().min(1).max(200)).max(10).default([]).describe('Image versionIds from read-workspace to edit or build on; empty to generate from the prompt alone.'),
    count: z.number().int().min(1).max(10).default(1).describe('How many images to make, 1 to 10.'),
    size: size.default('auto').describe('"auto" or WxH, which sets the shape, not exact pixels. Keep the long side at 2048 or less.'),
    reasoning: z.enum(['high', 'low']).default('high').describe('How much Meta reasons about the prompt first.'),
    imageSearch: z.boolean().default(true).describe('Let Meta search for reference images.'),
    webSearch: z.boolean().default(true).describe('Let Meta search the web.'),
    shell: z.boolean().default(true).describe('Let Meta use its code tool.'),
    showInChat: z.boolean().default(false).describe('True when the user asked for an image directly, to show it in the chat.'),
  }),
  phrase: 'Making an image…',
  phraseFor: input => input.count > 1 ? `Making ${input.count} images…` : 'Making an image…',
  // A refusal still finishes the line. Mastra hands back an input validation failure as `{ error: true }`.
  doneSummary: (result: GenerateImageResult | { error: true }) => {
    if ('error' in result) return summaries.invalid;
    if (!result.made) return summaries[result.reason];
    const total = result.images.length + result.failed;
    if (result.failed) return `Saved ${result.images.length} of ${total} images`;
    const [only] = result.images;
    return result.images.length > 1 ? `Saved ${result.images.length} images` : only?.label ? `Saved ${only.label}` : 'Saved 1 image';
  },
  execute: async (input, context): Promise<GenerateImageResult> => {
    const { scope, collaborators, signal } = context;
    let inputs: { versionId: string; dataUrl: string }[] = [];
    if (input.inputImages.length) {
      const read = await collaborators.readImageInputs(scope.accountId, scope.videoId, input.inputImages);
      if (read.kind === 'not_found') return refusal('input_not_found');
      if (read.kind === 'unavailable') return refusal('unavailable');
      inputs = read.images;
    }
    if (!collaborators.images) return refusal('unavailable');
    const request = {
      prompt: input.prompt, n: input.count, size: input.size, outputFormat: 'png' as const, reasoningStrength: input.reasoning,
      tools: { imageSearch: input.imageSearch, webSearch: input.webSearch, shell: input.shell },
    };
    let result: ImageResult;
    try {
      result = inputs.length ? await collaborators.images.edit({ ...request, images: inputs.map(image => ({ dataUrl: image.dataUrl })) }, signal)
        : await collaborators.images.generate(request, signal);
    } catch (error) {
      if (!(error instanceof MetaImageError)) throw error;
      // Stop: the run's own handling ends the line as incomplete.
      if (error.code === 'aborted') signal.throwIfAborted();
      if (error.code === 'content_policy') return refusal('content_policy');
      if (error.code === 'invalid_request') return refusal('invalid', error.param);
      return refusal('unavailable');
    }
    // One at a time in Meta's order, so names follow that order and the media checker isn't contended.
    const saved: Omit<SavedImage, 'label'>[] = [];
    let refused = 0, unsaved = 0;
    // Never more than asked for, even if Meta returns more.
    for (const image of result.images.slice(0, input.count)) {
      // Nothing from a response is saved after Stop; images saved before it stay.
      signal.throwIfAborted();
      const outcome = await collaborators.saveGeneratedImage(scope.accountId, scope.videoId, { bytes: image.bytes, contentType: image.contentType, inputs: inputs.map(item => item.versionId) }, signal);
      signal.throwIfAborted();
      if (outcome.kind === 'saved') saved.push({ versionId: outcome.versionId, width: outcome.width, height: outcome.height });
      else if (outcome.kind === 'refused') refused++;
      else unsaved++;
    }
    const failed = refused + unsaved;
    if (!saved.length) return refusal(unsaved ? 'not_saved' : 'checks');
    return { made: true, images: await labelled(context, saved), failed, showInChat: input.showInChat };
  },
});
