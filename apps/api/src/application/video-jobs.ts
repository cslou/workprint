import { setTimeout as delay } from 'node:timers/promises';
import { GenerationJobError, maxReferenceImages, MiniMaxVideoError, validateVideoRequest, type GenerationJobs, type JobFailure, type JobTarget, type MiniMaxVideoClient, type MiniMaxVideoErrorCode, type VideoFrame, type VideoRatio, type VideoRequest } from '../generation/index.js';
import { logFailure } from './failure-log.js';
import type { ReadImageInputs } from './generated-images.js';
import type { SaveGeneratedVideo } from './generated-videos.js';

/** Why the caller's signal fired: Stop and the turn deadline interrupt a job; a shutdown leaves it running. */
export type VideoAbortReason = 'stop' | 'deadline' | 'shutdown';
export type VideoRunControl = Readonly<{ signal: AbortSignal; abortReason: () => VideoAbortReason | undefined }>;
/**
 * A new video. `firstFrame` and `lastFrame`, or else 1–9 `referenceImageIds`, are image version ids this video uses.
 * `target`: the Shot it is made for.
 */
export type NewVideo = Readonly<{ prompt: string; durationS: number; ratio: VideoRatio; firstFrame?: string; lastFrame?: string; referenceImageIds?: readonly string[]; target?: JobTarget }>;
/** Why MiniMax didn't make the video: a refused create (its client code), or its own failed or cancelled task. */
export type VideoProviderFailure = Exclude<MiniMaxVideoErrorCode, 'aborted'> | 'task_failed' | 'task_cancelled';

export type VideoJobOutcome =
  /** `gone`: the job's Shot left the storyboard, so its clip was saved as a generated video. */
  | { kind: 'saved'; jobId: string; versionId: string; width: number; height: number; durationMs: number; gone: boolean }
  /**
   * Stop, the turn or poll deadline, or a download or save that was unavailable after MiniMax finished: resumable.
   * `no_room`: a Shot's clip was made, but the video had no use left for it.
   */
  | { kind: 'interrupted'; jobId: string; cause?: 'frame_unused' | 'no_room' }
  /** The server is shutting down: the job stays `running` for the next start to mark interrupted. */
  | { kind: 'shutdown'; jobId: string }
  | { kind: 'failed'; jobId: string; reason: JobFailure; provider?: VideoProviderFailure }
  /** Nothing was saved or sent. `not_started`: the caller's signal fired before the create, so none is paid for. */
  /** `no_room`: a Shot's video would need a new use, and the video has none left. */
  | { kind: 'input_not_found' } | { kind: 'invalid'; detail?: string } | { kind: 'not_started' } | { kind: 'no_room' }
  /** Resume refusals: an unknown job, one still being made, one already saved, one that failed. */
  | { kind: 'not_found' } | { kind: 'busy'; jobId: string } | { kind: 'already_saved'; jobId: string; versionId: string } | { kind: 'not_resumable'; jobId: string; reason: JobFailure }
  /** Saved work couldn't be reached. `created`: the create was already sent, so the task may be waiting at MiniMax. */
  | { kind: 'unavailable'; created: boolean };

export type VideoJobTiming = Readonly<{ pollIntervalMs: number; pollDeadlineMs: number }>;
/** MiniMax suggests polling about every 10 s; a job is waited on for at most 30 minutes per turn. */
export const videoJobTiming: VideoJobTiming = Object.freeze({ pollIntervalMs: 10_000, pollDeadlineMs: 30 * 60_000 });

type Jobs = Pick<GenerationJobs, 'begin' | 'started' | 'failed' | 'interrupted' | 'resumed' | 'get' | 'list'>;
/**
 * One job of this video that stopped waiting: its id is what a resume names. `images` are its exact input image
 * versions, in order: its frames, or its reference images.
 */
export type StoppedVideo = Readonly<{ jobId: string; images: readonly string[]; submittedAt: Date }>;
export type StoppedVideosOutcome = { kind: 'read'; jobs: readonly StoppedVideo[] } | { kind: 'unavailable' };
/** At most this many stopped jobs are listed, newest first. */
export const stoppedVideosLimit = 5;
export type VideoJobCollaborators = Readonly<{
  jobs: Jobs; client: Pick<MiniMaxVideoClient, 'submit' | 'query' | 'download'>;
  readImageInputs: ReadImageInputs; saveVideo: SaveGeneratedVideo; timing?: VideoJobTiming;
  /** Whether a Shot's next video can be kept: it moves a draft use, or the video has room for a new one. */
  shotRoom: (accountId: string, videoId: string, shotId: string) => Promise<boolean>;
}>;

/** Where a create MiniMax refused leaves its job. A create whose outcome is unknown is never sent again. */
function createFailure(error: MiniMaxVideoError): { reason: JobFailure; provider: VideoProviderFailure } {
  if (error.outcomeUnknown) return { reason: 'outcome_unknown', provider: error.code === 'aborted' ? 'unavailable' : error.code };
  if (error.code === 'invalid_request') return { reason: 'invalid_input', provider: 'invalid_request' };
  return { reason: 'provider_error', provider: error.code === 'aborted' ? 'unavailable' : error.code };
}

/**
 * Runs one MiniMax video job to its end for an agent tool: create once, poll, download, check and save the clip as
 * the video's draft. Every state is saved before the next paid step, so a job is never sent twice. Stop and the
 * deadlines interrupt a job, keeping its task id for a resume; a shutdown leaves it running for the next start.
 * Account and video come from trusted server context (an admitted native run), never from model arguments.
 */
export function createVideoJobs(collaborators: VideoJobCollaborators) {
  const { jobs, client, readImageInputs, saveVideo, shotRoom } = collaborators;
  const timing = collaborators.timing ?? videoJobTiming;

  /** The caller's signal fired: interrupt the job, unless the server is shutting down. */
  async function stopped(account: string, jobId: string, control: VideoRunControl): Promise<VideoJobOutcome> {
    if (control.abortReason() === 'shutdown') return { kind: 'shutdown', jobId };
    await jobs.interrupted(account, jobId);
    return { kind: 'interrupted', jobId };
  }

  async function refused(account: string, jobId: string): Promise<VideoJobOutcome> {
    await jobs.failed(account, jobId, 'check_refused');
    return { kind: 'failed', jobId, reason: 'check_refused' };
  }

  /** Polls a running job's task, then downloads, checks and saves its clip. `frames` and `target` are the job's own. */
  async function wait(account: string, video: string, jobId: string, taskId: string, { frames, target }: Readonly<{ frames: readonly string[]; target?: JobTarget | undefined }>, control: VideoRunControl): Promise<VideoJobOutcome> {
    const { signal } = control;
    const deadline = AbortSignal.timeout(timing.pollDeadlineMs);
    const polling = AbortSignal.any([signal, deadline]);
    let url: string | undefined;
    while (!url) {
      if (signal.aborted) return stopped(account, jobId, control);
      if (deadline.aborted) { await jobs.interrupted(account, jobId); return { kind: 'interrupted', jobId }; }
      try {
        const task = await client.query(taskId, polling);
        if (task.status === 'succeeded') { url = task.result.url; break; }
        if (task.status === 'failed' || task.status === 'cancelled') {
          await jobs.failed(account, jobId, 'provider_error');
          return { kind: 'failed', jobId, reason: 'provider_error', provider: task.status === 'failed' ? 'task_failed' : 'task_cancelled' };
        }
      } catch (error) {
        // Polling never fails a paid task: any query error is waited out until the deadline.
        if (!(error instanceof MiniMaxVideoError)) throw error;
      }
      // Stop or the deadline ends the wait early; the loop then settles the job.
      await delay(timing.pollIntervalMs, undefined, { signal: polling }).catch(() => undefined);
    }
    let bytes: Uint8Array;
    try { bytes = await client.download(url, signal); } catch (error) {
      if (!(error instanceof MiniMaxVideoError)) throw error;
      if (signal.aborted) return stopped(account, jobId, control);
      // A clip too large to accept stays too large: the job fails. Any other download error stays resumable, since
      // MiniMax keeps the task for 7 days and a fresh query gives a fresh URL (an expired one is refused).
      if (error.tooLarge) return refused(account, jobId);
      await jobs.interrupted(account, jobId);
      return { kind: 'interrupted', jobId };
    }
    // Nothing is saved from a download that finished after Stop.
    if (signal.aborted) return stopped(account, jobId, control);
    const saved = await saveVideo(account, video, { bytes, frames, jobId, ...(target ? { target } : {}) }, signal);
    if (saved.kind === 'saved') return { kind: 'saved', jobId, versionId: saved.versionId, width: saved.width, height: saved.height, durationMs: saved.durationMs, gone: saved.gone };
    if (signal.aborted) return stopped(account, jobId, control);
    if (saved.kind === 'refused') return refused(account, jobId);
    // Unavailable, or a frame this video no longer uses (the user can use it again): the job stays resumable.
    // A job with no frames has none to restore, so its not-found reads as a plain stop.
    // A Shot's clip with no use left for it waits with its job until there is room.
    await jobs.interrupted(account, jobId);
    if (saved.kind === 'no_room') return { kind: 'interrupted', jobId, cause: 'no_room' };
    return saved.kind === 'not_found' && frames.length ? { kind: 'interrupted', jobId, cause: 'frame_unused' } : { kind: 'interrupted', jobId };
  }

  /**
   * Keeps each step's own outcome; anything unexpected from storage is logged and reported as unavailable, saying
   * whether the create had been sent. `run` calls `sent` just before it sends one.
   */
  async function guarded(label: string, run: (sent: () => void) => Promise<VideoJobOutcome>, created = false): Promise<VideoJobOutcome> {
    try { return await run(() => { created = true; }); } catch (error) {
      logFailure(label, error);
      return { kind: 'unavailable', created };
    }
  }

  return Object.freeze({
    /** Starts a new job: its images and request are checked before anything is saved or sent. */
    start: (account: string, video: string, input: NewVideo, control: VideoRunControl) => guarded('Video job failed', async sent => {
      const references = input.referenceImageIds;
      // Reference images and frames are two kinds of request; a count MiniMax refuses is refused before any read.
      if (references !== undefined && (input.firstFrame !== undefined || input.lastFrame !== undefined || !references.length || references.length > maxReferenceImages)) return { kind: 'invalid', detail: 'referenceImages' };
      const ids = references !== undefined ? [...references] : [input.firstFrame, input.lastFrame].filter((id): id is string => id !== undefined);
      // A job and a clip's dependencies name each image once, so one image can't be both frames, or two references.
      if (new Set(ids).size !== ids.length) return { kind: 'invalid', detail: references !== undefined ? 'referenceImages' : 'lastFrame' };
      let images: VideoFrame[] = [];
      if (ids.length) {
        const read = await readImageInputs(account, video, ids);
        if (read.kind !== 'read') return read.kind === 'not_found' ? { kind: 'input_not_found' } : { kind: 'unavailable', created: false };
        images = read.images.map(image => ({ dataUrl: image.dataUrl, width: image.width, height: image.height }));
      }
      const frames = references !== undefined ? [] : images;
      const [first, last] = input.firstFrame === undefined ? [undefined, frames[0]] : [frames[0], frames[1]];
      const request: VideoRequest = {
        prompt: input.prompt, durationS: input.durationS,
        ...(frames.length ? {} : { ratio: input.ratio }), ...(first ? { firstFrame: first } : {}), ...(last ? { lastFrame: last } : {}),
        ...(references !== undefined ? { referenceImages: images } : {}),
      };
      try { validateVideoRequest(request); } catch (error) {
        if (error instanceof MiniMaxVideoError) return { kind: 'invalid', ...(error.detail ? { detail: error.detail } : {}) };
        throw error;
      }
      // A Shot's video that would need a use the video doesn't have is never paid for.
      if (input.target && !await shotRoom(account, video, input.target.shotId)) return { kind: 'no_room' };
      // Once the caller's signal fired, nothing new is paid for.
      if (control.signal.aborted) return { kind: 'not_started' };
      const job = await jobs.begin(account, video, { prompt: request.prompt, inputs: ids, target: input.target });
      let taskId: string;
      // The create is never cut off by Stop: it ends with a task id or an unknown outcome within its own timeout.
      sent();
      try { taskId = (await client.submit(request)).taskId; } catch (error) {
        if (!(error instanceof MiniMaxVideoError)) throw error;
        const failure = createFailure(error);
        await jobs.failed(account, job.id, failure.reason);
        return { kind: 'failed', jobId: job.id, ...failure };
      }
      await jobs.started(account, job.id, taskId);
      return wait(account, video, job.id, taskId, { frames: ids, target: input.target }, control);
    }),

    /** Waits on an interrupted job's same task again; nothing is created. Other states refuse. */
    // A resumed job's task was created by an earlier call.
    resume: (account: string, video: string, jobId: string, control: VideoRunControl) => guarded('Video job resume failed', async () => {
      let job;
      try { job = await jobs.get(account, jobId); } catch (error) {
        if (error instanceof GenerationJobError && error.code === 'not_found') return { kind: 'not_found' };
        throw error;
      }
      if (job.conversationId !== video) return { kind: 'not_found' };
      if (job.status === 'submitting' || job.status === 'running') return { kind: 'busy', jobId };
      if (job.status === 'succeeded') return job.resultVersionId ? { kind: 'already_saved', jobId, versionId: job.resultVersionId } : { kind: 'unavailable', created: true };
      if (job.status === 'failed') return { kind: 'not_resumable', jobId, reason: job.failureReason ?? 'provider_error' };
      // An interrupted job always has its task id: the create is never cut off.
      if (!job.taskId) return { kind: 'unavailable', created: true };
      let resumed;
      try { resumed = await jobs.resumed(account, jobId); } catch (error) {
        if (!(error instanceof GenerationJobError)) throw error;
        // Another turn resumed it first, or it expired just now.
        const now = await jobs.get(account, jobId);
        if (now.status === 'failed') return { kind: 'not_resumable', jobId, reason: now.failureReason ?? 'provider_error' };
        if (now.status === 'succeeded' && now.resultVersionId) return { kind: 'already_saved', jobId, versionId: now.resultVersionId };
        return { kind: 'busy', jobId };
      }
      // A resumed Shot job still saves its clip to its Shot.
      return wait(account, video, jobId, job.taskId, { frames: resumed.inputs, target: resumed.target }, control);
    }, true),

    /**
     * This video's jobs that stopped waiting, newest first, so the agent can name one to resume after a restart,
     * when no tool result in the history carries its id. Another account's or video's jobs are never listed.
     */
    async stopped(account: string, video: string): Promise<StoppedVideosOutcome> {
      try {
        const page = await jobs.list(account, video, { limit: stoppedVideosLimit, status: 'interrupted' });
        return { kind: 'read', jobs: page.jobs.map(job => ({ jobId: job.id, images: job.inputs, submittedAt: job.submittedAt })) };
      } catch (error) {
        logFailure('Stopped video jobs read failed', error);
        return { kind: 'unavailable' };
      }
    },
  });
}
export type VideoJobs = ReturnType<typeof createVideoJobs>;
