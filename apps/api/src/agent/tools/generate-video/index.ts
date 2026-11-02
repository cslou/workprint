import { z } from 'zod';
import type { VideoJobOutcome, VideoProviderFailure } from '../../../application/index.js';
import { videoDurations, videoRatios } from '../../../generation/index.js';
import { defineTool, type ToolContext } from '../define.js';
import { workspaceItem } from '../../workspace-entries.js';

type Reason =
  | 'unsaveable' | 'input_not_found' | 'invalid' | 'stopped' | 'outcome_unknown' | 'refused' | 'unauthorized' | 'payment_required'
  | 'rate_limited' | 'unavailable' | 'task_failed' | 'task_cancelled' | 'checks' | 'not_found' | 'busy' | 'already_saved' | 'not_resumable'
  | 'jobs_unavailable' | 'work_unavailable' | 'frame_unused';
/** One saved clip, named as read-workspace names it; the name is left out when the workspace can't be read. */
type SavedClip = { versionId: string; label?: string; width: number; height: number; durationS: number };
export type GenerateVideoResult =
  | { made: true; video: SavedClip; jobId: string; showInChat: boolean }
  | { made: false; reason: Reason; message: string; jobId?: string; label?: string };

const summaries: Readonly<Record<Exclude<Reason, 'already_saved'>, string>> = {
  unsaveable: 'Not made: videos can’t be saved on this server',
  input_not_found: 'Not made: an input image wasn’t found',
  invalid: 'Not made: the request wasn’t valid',
  stopped: 'Stopped waiting for the video',
  outcome_unknown: 'Not made: MiniMax’s answer was lost',
  refused: 'Not made: MiniMax refused the request',
  unauthorized: 'Not made: MiniMax refused the server key',
  payment_required: 'Not made: MiniMax asked for payment',
  rate_limited: 'Not made: MiniMax is busy',
  unavailable: 'Not made: MiniMax is unavailable',
  task_failed: 'Not made: MiniMax couldn’t make the video',
  task_cancelled: 'Not made: MiniMax cancelled the video',
  checks: 'Not saved: the video didn’t pass checks',
  not_found: 'Couldn’t find that video job',
  busy: 'That video is still being made',
  not_resumable: 'That video failed and can’t be resumed',
  jobs_unavailable: 'Not saved: saved video jobs are unavailable',
  work_unavailable: 'Not made: saved work is unavailable',
  frame_unused: 'Not saved: a frame is no longer used here',
};
const messages: Readonly<Record<Exclude<Reason, 'invalid' | 'stopped' | 'already_saved' | 'frame_unused'>, string>> = {
  unsaveable: 'Not made: this server cannot save videos, so nothing was sent to MiniMax. Tell the user; do not retry.',
  input_not_found: 'Not made: a frame is not an image this video uses. Call read-workspace and pass only image versionIds it lists. Nothing was sent.',
  outcome_unknown: 'Not made: MiniMax may have started this video, but its answer was lost, so it cannot be resumed and was not sent again. Tell the user; do not retry unless they ask.',
  refused: 'Not made: MiniMax refused this request, for example its content. Rephrase the prompt or change the frames, or ask the user how to change it.',
  unauthorized: 'Not made: MiniMax refused this server\'s key. Tell the user; do not retry.',
  payment_required: 'Not made: MiniMax refused the request for payment. Tell the user; do not retry.',
  rate_limited: 'Not made: MiniMax is limiting requests right now. Tell the user; they can ask again later.',
  unavailable: 'Not made: MiniMax video generation is unavailable right now. Tell the user; do not retry in this turn.',
  task_failed: 'Not made: MiniMax failed to make this video. Tell the user; you may try once more with a changed prompt if they want.',
  task_cancelled: 'Not made: MiniMax cancelled this video. Tell the user; do not retry unless they ask.',
  checks: 'Not saved: the video MiniMax made could not be accepted: it failed the media checks, was too large, or its frames are no longer used by this video. Tell the user; do not retry in this turn.',
  not_found: 'No video job with that id belongs to this video. Leave resume empty to make a new video.',
  busy: 'That video job is still being made in another turn. Tell the user; do not start it again.',
  not_resumable: 'That video job failed and cannot be resumed. Tell the user; make a new video only if they ask.',
  jobs_unavailable: 'Saved video jobs are unavailable right now, so this video job could not be tracked; MiniMax may have started it. Tell the user; do not retry in this turn.',
  work_unavailable: 'Not made: saved work could not be reached, so nothing was sent to MiniMax. Tell the user; do not retry in this turn.',
};
const providerReasons: Readonly<Record<VideoProviderFailure, Exclude<Reason, 'invalid' | 'stopped' | 'already_saved' | 'frame_unused'>>> = {
  invalid_request: 'refused', unauthorized: 'unauthorized', payment_required: 'payment_required', rate_limited: 'rate_limited',
  unavailable: 'unavailable', failed: 'unavailable', task_failed: 'task_failed', task_cancelled: 'task_cancelled',
};

const refusal = (reason: Exclude<Reason, 'invalid' | 'stopped' | 'already_saved' | 'frame_unused'>, jobId?: string): GenerateVideoResult => ({ made: false, reason, message: messages[reason], ...(jobId ? { jobId } : {}) });

/** Names a saved clip as read-workspace does, so the model and the user see the same name. */
async function labelOf(context: ToolContext, versionId: string) {
  const read = await context.collaborators.readWorkspace(context.scope.accountId, context.scope.videoId);
  return read.kind === 'found' ? workspaceItem(read.workspace, versionId)?.name : undefined;
}

const stoppedResult = (jobId: string): GenerateVideoResult => ({ made: false, reason: 'stopped', jobId,
  message: `Stopped waiting before the video was saved; MiniMax keeps it for 7 days. Tell the user it can be resumed: call generate-video with resume set to "${jobId}" when they ask.` });

async function result(context: ToolContext, outcome: VideoJobOutcome, showInChat: boolean): Promise<GenerateVideoResult> {
  switch (outcome.kind) {
    case 'saved': {
      const label = await labelOf(context, outcome.versionId);
      return { made: true, jobId: outcome.jobId, showInChat,
        video: { versionId: outcome.versionId, ...(label ? { label } : {}), width: outcome.width, height: outcome.height, durationS: Math.round(outcome.durationMs / 100) / 10 } };
    }
    case 'interrupted':
      if (outcome.cause === 'frame_unused') return { made: false, reason: 'frame_unused', jobId: outcome.jobId,
        message: `Not saved: MiniMax made the video, but one of its frames is no longer an image this video uses. Ask the user to use that image again in the video, then call generate-video with resume set to "${outcome.jobId}".` };
      return stoppedResult(outcome.jobId);
    // A shutdown ends the call before this; were it to reach here, it reads as a stop.
    case 'shutdown': return stoppedResult(outcome.jobId);
    case 'failed':
      if (outcome.reason === 'outcome_unknown') return refusal('outcome_unknown', outcome.jobId);
      if (outcome.reason === 'check_refused') return refusal('checks', outcome.jobId);
      return refusal(outcome.provider ? providerReasons[outcome.provider] : 'unavailable', outcome.jobId);
    case 'input_not_found': return refusal('input_not_found');
    case 'invalid': return { made: false, reason: 'invalid',
      message: `Not made: the request wasn't valid${outcome.detail ? ` (${outcome.detail})` : ''}. Nothing was sent. Fix that field and try once more.` };
    case 'not_found': return refusal('not_found');
    case 'busy': return refusal('busy', outcome.jobId);
    case 'already_saved': {
      const label = await labelOf(context, outcome.versionId);
      return { made: false, reason: 'already_saved', jobId: outcome.jobId, ...(label ? { label } : {}),
        message: `That video job is already saved${label ? ` as ${label}` : ''}. Do not resume it again.` };
    }
    case 'not_resumable': return refusal('not_resumable', outcome.jobId);
    case 'unavailable': return refusal(outcome.created ? 'jobs_unavailable' : 'work_unavailable');
    // A call whose signal fired ends before this; were it to reach here, nothing was sent.
    case 'not_started': return { made: false, reason: 'stopped', message: 'Stopped before the video was started; nothing was sent to MiniMax.' };
  }
}

/** Makes one video with MiniMax, optionally from the video's saved images as frames, waits for it and saves it as the video's draft clip. */
export const generateVideoTool = defineTool({
  id: 'generate-video',
  description: [
    'Make one short video clip with MiniMax and save it as a draft clip of this video. It waits until the clip is made, usually a few minutes. Saving is never approval.',
    'Write the prompt about motion: the subject, the one action it performs, how the camera moves (for example a slow push-in or a pan left), the setting and the mood. Keep it to one continuous shot.',
    'firstFrame and lastFrame are optional image versionIds from read-workspace: the clip starts on firstFrame and, when given, ends on lastFrame. A lastFrame needs a firstFrame. With frames, the ratio comes from them.',
    'Each call makes a new paid video. Make one call per video the user asked for.',
    'If an earlier call stopped waiting, its result gave a jobId. When the user asks to continue or resume that video, call again with resume set to that jobId; the other fields are then ignored and nothing new is paid for.',
    'Set showInChat to true when the user asked for a video directly, so it is shown in the chat.',
  ].join(' '),
  inputSchema: z.strictObject({
    prompt: z.string().max(7000).default('').describe('The motion prompt; may be empty only with resume.'),
    durationS: z.number().int().min(videoDurations.min).max(videoDurations.max).default(6).describe('Whole seconds, 4 to 15.'),
    ratio: z.enum(videoRatios).default('16:9').describe('The shape without frames; ignored with frames.'),
    firstFrame: z.string().max(200).default('').describe('An image versionId from read-workspace for the first frame; empty for none.'),
    lastFrame: z.string().max(200).default('').describe('An image versionId for the last frame, only with a firstFrame; empty for none.'),
    resume: z.string().max(200).default('').describe('The jobId of a video that stopped waiting, to wait on it again; empty for a new video.'),
    showInChat: z.boolean().default(false).describe('True when the user asked for a video directly, to show it in the chat.'),
  }),
  phrase: 'Making a video…',
  // A refusal still finishes the line. Mastra hands back an input validation failure as `{ error: true }`.
  doneSummary: (result: GenerateVideoResult | { error: true }) => {
    if ('error' in result) return summaries.invalid;
    if (result.made) return result.video.label ? `Saved ${result.video.label}` : 'Saved 1 video';
    if (result.reason === 'already_saved') return result.label ? `That video is already saved as ${result.label}` : 'That video is already saved';
    return summaries[result.reason];
  },
  // Shown only when the user asked for a video directly; a refusal shows none.
  shownMedia: (result: GenerateVideoResult | { error: true }) => 'made' in result && result.made && result.showInChat ? [{ kind: 'video', versionId: result.video.versionId }] : [],
  execute: async (input, context): Promise<GenerateVideoResult> => {
    const { scope, collaborators, signal, abortReason } = context;
    // Without a way to save, a paid video would be lost: nothing is sent. Composition supplies the jobs only with saving.
    const videos = collaborators.videos;
    if (!videos) return refusal('unsaveable');
    const control = { signal, abortReason };
    const resume = input.resume.trim();
    let outcome: VideoJobOutcome;
    if (resume) outcome = await videos.resume(scope.accountId, scope.videoId, resume, control);
    else {
      if (!input.prompt.trim()) return { made: false, reason: 'invalid', message: 'Not made: the prompt is empty. Write a motion prompt, or set resume to continue an earlier video. Nothing was sent.' };
      outcome = await videos.start(scope.accountId, scope.videoId, {
        prompt: input.prompt, durationS: input.durationS, ratio: input.ratio,
        ...(input.firstFrame.trim() ? { firstFrame: input.firstFrame.trim() } : {}), ...(input.lastFrame.trim() ? { lastFrame: input.lastFrame.trim() } : {}),
      }, control);
    }
    // A shutdown ends the turn as incomplete; the job stays running for the next start to mark interrupted.
    // A call stopped before its create made nothing, and ends incomplete too.
    if (outcome.kind === 'shutdown' || outcome.kind === 'not_started') signal.throwIfAborted();
    return result(context, outcome, input.showInChat);
  },
});
