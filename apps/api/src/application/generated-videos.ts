import { UploadError, type GeneratedVideoInput, type GeneratedVideoSave, type WithinSave } from '../artifacts/index.js';
import type { GenerationJobs } from '../generation/index.js';
import { logFailure } from './failure-log.js';

/** What saving an assistant-made clip did. `refused` means the bytes didn't pass the media checks. */
export type GeneratedVideoOutcome =
  | { kind: 'saved'; versionId: string; width: number; height: number; durationMs: number }
  | { kind: 'refused' } | { kind: 'not_found' } | { kind: 'unavailable' };
/** Account and video come from trusted server context (an admitted native run), never from model arguments. */
export type SaveGeneratedVideo = (accountId: string, videoId: string, input: GeneratedVideoInput & Readonly<{ jobId: string }>, signal?: AbortSignal) => Promise<GeneratedVideoOutcome>;
type SaveClip = (account: string, conversation: string, input: GeneratedVideoInput, options: Readonly<{ signal?: AbortSignal | undefined; within?: WithinSave }>) => Promise<GeneratedVideoSave>;

/**
 * In-process clip saves for agent tools. The job's `succeeded` move runs inside the clip's transaction, so the
 * clip and the job's result commit together or neither does: a job that already finished saves no second clip.
 */
export function createGeneratedVideoSaver(save: SaveClip, jobs: Pick<GenerationJobs, 'succeeded'>): SaveGeneratedVideo {
  return async (accountId, videoId, { jobId, ...input }, signal) => {
    try {
      const { version } = await save(accountId, videoId, input, { signal, within: (client, saved) => jobs.succeeded(client, accountId, videoId, jobId, saved.id, input.frames) });
      return { kind: 'saved', versionId: version.id, width: version.media.width, height: version.media.height, durationMs: version.media.durationMs ?? 0 };
    } catch (error) {
      if (error instanceof UploadError && (error.code === 'invalid_input' || error.code === 'unsupported')) return { kind: 'refused' };
      if (error instanceof UploadError && error.code === 'not_found') return { kind: 'not_found' };
      logFailure('Generated video save failed', error);
      return { kind: 'unavailable' };
    }
  };
}
