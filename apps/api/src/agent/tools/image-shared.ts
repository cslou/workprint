import { z } from 'zod';

const maxRatio = 16;
/** "auto", or "WxH" within Meta's ratio limit. The long side is guidance, not a rule: Meta picks the pixels. */
export const imageSize = z.string().regex(/^(auto|\d{2,5}x\d{2,5})$/).refine(value => {
  if (value === 'auto') return true;
  const [width, height] = value.split('x').map(Number) as [number, number];
  return width > 0 && height > 0 && Math.max(width, height) / Math.min(width, height) <= maxRatio;
}, 'The shape must be "auto" or WxH with a ratio of 16 or less');

/** Why a Meta image wasn't made or kept, as every image tool reports it. `param` is the field Meta found invalid. */
export type ImageFailure = Readonly<{ reason: 'content_policy' | 'invalid' | 'unavailable' | 'unsaveable' | 'checks' | 'not_saved'; param?: string | undefined }>;

const summaries: Readonly<Record<ImageFailure['reason'], string>> = {
  content_policy: 'Not made: the request was refused',
  unavailable: 'Not made: Meta is unavailable',
  unsaveable: 'Not made: images can’t be saved on this server',
  checks: 'Not saved: the image didn’t pass checks',
  not_saved: 'Not saved: the image couldn’t be stored',
  invalid: 'Not made: the request wasn’t valid',
};
const messages: Readonly<Record<Exclude<ImageFailure['reason'], 'invalid'>, string>> = {
  content_policy: 'Not made: Meta refused this request under its content policy. Rephrase the prompt without the refused content, or ask the user how to change it.',
  unavailable: 'Not made: Meta image generation is unavailable right now. Tell the user; do not retry more than once in this turn.',
  unsaveable: 'Not made: this server cannot save images, so nothing was sent to Meta. Tell the user; do not retry.',
  checks: 'Not saved: the image Meta returned did not pass the media checks. Tell the user; you may try once more with a different size.',
  not_saved: 'Not saved: Meta made the image but saving is unavailable right now. Tell the user and do not retry in this turn.',
};

/** The done line and the message the model can follow for one image failure. */
export function imageFailure({ reason, param }: ImageFailure): { summary: string; message: string } {
  return {
    summary: summaries[reason],
    message: reason === 'invalid' ? `Not made: Meta found the request invalid${param ? ` (${param})` : ''}. Fix that field and try once more.` : messages[reason],
  };
}
