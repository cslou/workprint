import type { VideoJobOutcome, VideoProviderFailure } from '../../application/index.js';
import { workspaceItem } from '../workspace-entries.js';
import type { ToolContext } from './define.js';

/** Every reason a MiniMax video job wasn't made or saved, as the video tools report it. */
export type VideoReason =
  | 'unsaveable' | 'input_not_found' | 'invalid' | 'stopped' | 'outcome_unknown' | 'refused' | 'unauthorized' | 'payment_required'
  | 'rate_limited' | 'unavailable' | 'task_failed' | 'task_cancelled' | 'checks' | 'not_found' | 'busy' | 'already_saved' | 'not_resumable'
  | 'jobs_unavailable' | 'work_unavailable' | 'frame_unused' | 'no_room' | 'waiting_for_room';
/** One saved clip, named as read-workspace names it; the name is left out when the workspace can't be read. */
type SavedClip = { versionId: string; label?: string; width: number; height: number; durationS: number };
/** `gone`: the job's Shot left the storyboard, so its clip was saved as a generated video. */
export type VideoResult =
  | { made: true; video: SavedClip; jobId: string; showInChat: boolean; gone?: true }
  | { made: false; reason: VideoReason; message: string; jobId?: string; label?: string };
/** A reason with one fixed message the model can follow. */
type Fixed = Exclude<VideoReason, 'invalid' | 'stopped' | 'already_saved' | 'frame_unused' | 'waiting_for_room'>;

const summaries: Readonly<Record<Exclude<VideoReason, 'already_saved'>, string>> = {
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
  no_room: 'Not made: this video has too many saved items',
  waiting_for_room: 'Not saved yet: this video has too many saved items',
};
const messages: Readonly<Record<Fixed, string>> = {
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
  no_room: 'Not made: this video has no room for another Shot video. Tell the user; do not retry. Nothing was sent.',
};
const providerReasons: Readonly<Record<VideoProviderFailure, Fixed>> = {
  invalid_request: 'refused', unauthorized: 'unauthorized', payment_required: 'payment_required', rate_limited: 'rate_limited',
  unavailable: 'unavailable', failed: 'unavailable', task_failed: 'task_failed', task_cancelled: 'task_cancelled',
};

/** A refusal with its fixed message, and the job it names when there is one. */
export const videoRefusal = (reason: Fixed, jobId?: string): VideoResult => ({ made: false, reason, message: messages[reason], ...(jobId ? { jobId } : {}) });

/** Names a saved clip as read-workspace does, so the model and the user see the same name. */
async function labelOf(context: ToolContext, versionId: string) {
  const read = await context.collaborators.readWorkspace(context.scope.accountId, context.scope.videoId);
  return read.kind === 'found' ? workspaceItem(read.workspace, versionId)?.name : undefined;
}

const stoppedResult = (jobId: string): VideoResult => ({ made: false, reason: 'stopped', jobId,
  message: `Stopped waiting before the video was saved; MiniMax keeps it for 7 days. Tell the user it can be resumed: call generate-video with resume set to "${jobId}" when they ask.` });

/** What a video job's outcome tells the model, named as read-workspace names its clip. */
export async function videoResult(context: ToolContext, outcome: VideoJobOutcome, showInChat: boolean): Promise<VideoResult> {
  switch (outcome.kind) {
    case 'saved': {
      const label = await labelOf(context, outcome.versionId);
      return { made: true, jobId: outcome.jobId, showInChat, ...(outcome.gone ? { gone: true as const } : {}),
        video: { versionId: outcome.versionId, ...(label ? { label } : {}), width: outcome.width, height: outcome.height, durationS: Math.round(outcome.durationMs / 100) / 10 } };
    }
    case 'interrupted':
      if (outcome.cause === 'no_room') return { made: false, reason: 'waiting_for_room', jobId: outcome.jobId,
        message: `Not saved yet: MiniMax made the video, but this video has no room for another saved item, so it waits with its job. Tell the user; once there is room, call generate-video with resume set to "${outcome.jobId}".` };
      if (outcome.cause === 'frame_unused') return { made: false, reason: 'frame_unused', jobId: outcome.jobId,
        message: `Not saved: MiniMax made the video, but one of its frames is no longer an image this video uses. Ask the user to use that image again in the video, then call generate-video with resume set to "${outcome.jobId}".` };
      return stoppedResult(outcome.jobId);
    // A shutdown ends the call before this; were it to reach here, it reads as a stop.
    case 'shutdown': return stoppedResult(outcome.jobId);
    case 'failed':
      if (outcome.reason === 'outcome_unknown') return videoRefusal('outcome_unknown', outcome.jobId);
      if (outcome.reason === 'check_refused') return videoRefusal('checks', outcome.jobId);
      return videoRefusal(outcome.provider ? providerReasons[outcome.provider] : 'unavailable', outcome.jobId);
    case 'input_not_found': return videoRefusal('input_not_found');
    case 'invalid': return { made: false, reason: 'invalid',
      message: `Not made: the request wasn't valid${outcome.detail ? ` (${outcome.detail})` : ''}. Nothing was sent. Fix that field and try once more.` };
    case 'not_found': return videoRefusal('not_found');
    case 'busy': return videoRefusal('busy', outcome.jobId);
    case 'already_saved': {
      const label = await labelOf(context, outcome.versionId);
      return { made: false, reason: 'already_saved', jobId: outcome.jobId, ...(label ? { label } : {}),
        message: `That video job is already saved${label ? ` as ${label}` : ''}. Do not resume it again.` };
    }
    case 'not_resumable': return videoRefusal('not_resumable', outcome.jobId);
    case 'unavailable': return videoRefusal(outcome.created ? 'jobs_unavailable' : 'work_unavailable');
    // A call whose signal fired ends before this; were it to reach here, nothing was sent.
    case 'not_started': return { made: false, reason: 'stopped', message: 'Stopped before the video was started; nothing was sent to MiniMax.' };
    case 'no_room': return videoRefusal('no_room');
  }
}

/** The done line for a video job's result. Mastra hands back an input validation failure as `{ error: true }`. */
export function videoDoneSummary(result: VideoResult | { error: true }): string {
  if ('error' in result) return summaries.invalid;
  if (result.made) {
    const saved = result.video.label ? `Saved ${result.video.label}` : 'Saved 1 video';
    return result.gone ? `${saved} (its Shot is gone)` : saved;
  }
  if (result.reason === 'already_saved') return result.label ? `That video is already saved as ${result.label}` : 'That video is already saved';
  return summaries[result.reason];
}

/** A video job's saved clip, to show under the done line. */
export const savedClip = (result: VideoResult | { error: true }) => 'made' in result && result.made ? [{ kind: 'video' as const, versionId: result.video.versionId }] : [];
