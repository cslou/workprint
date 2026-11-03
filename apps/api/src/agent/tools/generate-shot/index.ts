import { z } from 'zod';
import { makeShot, type ShotRefusal } from '../../../application/index.js';
import { maxVideoPromptCharacters } from '../../../generation/index.js';
import { defineTool } from '../define.js';
import { savedClip, videoDoneSummary, videoRefusal, videoResult, type VideoReason, type VideoResult } from '../video-shared.js';

export type GenerateShotResult = VideoResult | { made: false; reason: Extract<ShotRefusal, 'not_found' | 'needs_panels' | 'too_long'>; summary: string; message: string };

/** The line and the message for a Shot refused before any job is saved or sent. */
function refused(reason: ShotRefusal): GenerateShotResult {
  switch (reason) {
    case 'unsaveable': case 'work_unavailable': return videoRefusal(reason);
    case 'not_found': return { made: false, reason, summary: 'Not made: that Shot wasn’t found', message: 'Not made: shot must be a Shot id from read-workspace\'s storyboard. Call read-workspace and try once more. Nothing was sent.' };
    case 'needs_panels': return { made: false, reason, summary: 'Not made: make the Shot’s panels first', message: 'Not made: the Shot\'s video starts on its first panel\'s image and ends on its second\'s, and a panel has no image yet. Make its panels with generate-panel first. Nothing was sent.' };
    case 'too_long': return { made: false, reason, summary: 'Not made: the Shot’s text is too long for the video prompt', message: `Not made: the Shot's action, camera note and dialogue with this prompt are over MiniMax's ${maxVideoPromptCharacters} characters. Shorten the prompt, or save the storyboard with a shorter action or camera note. Nothing was sent.` };
  }
}

/**
 * The server picks a Shot's frames and text, so where generate-video's messages point the model at its frames or
 * fields, generate-shot's say what the model can change here: the panels or the motion prompt. The lines are shared.
 */
const shotMessages: Readonly<Partial<Record<VideoReason, string>>> = {
  input_not_found: 'Not made: a panel\'s image is no longer one this video uses. Call read-workspace, make the Shot\'s panels again with generate-panel, then try once more. Nothing was sent.',
  invalid: 'Not made: MiniMax would not take the Shot\'s panel images as frames, for example their size. Remake the Shot\'s panels with generate-panel, or tell the user. Nothing was sent.',
  refused: 'Not made: MiniMax refused this request, for example its content. Rephrase the motion prompt, or ask the user how to change the Shot.',
};
const forShot = (result: VideoResult): VideoResult => !result.made && shotMessages[result.reason] ? { ...result, message: shotMessages[result.reason]! } : result;

/** Makes one storyboard Shot's video with MiniMax from its panels and its text, and saves it as that Shot's next draft video. */
export const generateShotTool = defineTool({
  id: 'generate-shot',
  description: [
    'Make one storyboard Shot\'s video with MiniMax and save it as that Shot\'s next draft video. It waits until the clip is made, usually a few minutes. Saving is never approval: the user chooses Shot videos.',
    'shot is a Shot id from read-workspace\'s storyboard. Make the Shot\'s panels first: the server sends its first panel\'s current image as the first frame and its second panel\'s as the last frame, and puts the Shot\'s action, camera note and dialogue in the video prompt itself.',
    'Write prompt about motion only: how the action moves between the two frames and how the camera moves (for example a slow push-in or a pan left). Do not repeat the action or dialogue, describe the frames, or add story facts.',
    'The video runs for the Shot\'s length from the storyboard, which the user can change; a Shot with no length runs 6 seconds. To change it, save the storyboard with the new length first.',
    'Each call makes a new paid video. If it stops waiting, its result gives a jobId: resume it with generate-video when the user asks.',
  ].join(' '),
  inputSchema: z.strictObject({
    shot: z.string().min(1).max(200).describe('The Shot\'s id from read-workspace\'s storyboard.'),
    prompt: z.string().min(1).max(maxVideoPromptCharacters).refine(text => text.trim().length > 0, 'The prompt is empty').describe('The motion: how the action moves, and the camera.'),
  }),
  phrase: 'Making a video…',
  // A refusal still finishes the line. Mastra hands back an input validation failure as `{ error: true }`.
  doneSummary: (result: GenerateShotResult | { error: true }) => 'summary' in result ? result.summary : videoDoneSummary(result),
  // The saved Shot video shows under the line, as a panel's image does.
  shownMedia: (result: GenerateShotResult | { error: true }) => 'summary' in result ? [] : savedClip(result),
  execute: async (input, context): Promise<GenerateShotResult> => {
    const { scope, collaborators, signal, abortReason } = context;
    const outcome = await makeShot(collaborators, scope.accountId, scope.videoId, { shot: input.shot.trim(), prompt: input.prompt }, { signal, abortReason });
    if (outcome.kind === 'shot_refused') return refused(outcome.reason);
    // A shutdown ends the turn as incomplete; the job stays running for the next start to mark interrupted.
    // A call stopped before its create made nothing, and ends incomplete too.
    if (outcome.kind === 'shutdown' || outcome.kind === 'not_started') signal.throwIfAborted();
    return forShot(await videoResult(context, outcome, true));
  },
});
