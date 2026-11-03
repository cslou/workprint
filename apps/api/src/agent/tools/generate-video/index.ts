import { z } from 'zod';
import type { VideoJobOutcome } from '../../../application/index.js';
import { videoDurations, videoRatios } from '../../../generation/index.js';
import { defineTool } from '../define.js';
import { savedClip, videoDoneSummary, videoRefusal, videoResult, type VideoResult } from '../video-shared.js';

export type GenerateVideoResult = VideoResult;

/** Makes one video with MiniMax, optionally from the video's saved images as frames, waits for it and saves it as the video's draft clip. */
export const generateVideoTool = defineTool({
  id: 'generate-video',
  description: [
    'Make one short video clip with MiniMax and save it as a draft clip of this video. It waits until the clip is made, usually a few minutes. Saving is never approval.',
    'Write the prompt about motion: the subject, the one action it performs, how the camera moves (for example a slow push-in or a pan left), the setting and the mood. Keep it to one continuous shot.',
    'firstFrame and lastFrame are optional image versionIds from read-workspace: the clip starts on firstFrame and, when given, ends on lastFrame. A lastFrame needs a firstFrame. With frames, the ratio comes from them.',
    'Each call makes a new paid video. Make one call per video the user asked for.',
    'If an earlier call stopped waiting, its result gave a jobId; read-workspace also lists stoppedVideos with theirs, for example after a restart. When the user asks to continue or resume that video, call again with resume set to that jobId; the other fields are then ignored and nothing new is paid for.',
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
  doneSummary: videoDoneSummary,
  // Shown only when the user asked for a video directly; a refusal shows none.
  shownMedia: (result: GenerateVideoResult | { error: true }) => 'made' in result && result.made && result.showInChat ? savedClip(result) : [],
  execute: async (input, context): Promise<GenerateVideoResult> => {
    const { scope, collaborators, signal, abortReason } = context;
    // Without a way to save, a paid video would be lost: nothing is sent. Composition supplies the jobs only with saving.
    const videos = collaborators.videos;
    if (!videos) return videoRefusal('unsaveable');
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
    return videoResult(context, outcome, input.showInChat);
  },
});
