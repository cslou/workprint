import { ArtifactError, UploadError, UseRoomError, usedVideoVersions, whenFree, type GeneratedVideoInput, type GeneratedVideoSave, type JoinedMedia, type StoredVideo } from '../artifacts/index.js';
import { logFailure } from './failure-log.js';
import type { SavedWorkReads } from './saved-reads.js';

/** The clips one join takes, and how long they may run together. */
export const joinLimits = Object.freeze({ minClips: 2, maxClips: 20, maxLengthMs: 120_000 });

/**
 * What a join did. `joined` saved a new draft clip. `invalid`: fewer than 2 clips or more than 20. `not_found`: a clip isn't a video this video uses. `repeated`: a
 * clip was named twice. `too_long`: the clips' saved lengths add up past the limit. `incompatible`: the first clip
 * that can't be joined to clip 1, and how it differs. `stopped`: the call's signal fired; nothing was saved.
 */
export type JoinOutcome =
  | { kind: 'joined'; versionId: string; width: number; height: number; durationMs: number; clips: number }
  | { kind: 'invalid' } | { kind: 'not_found' } | { kind: 'repeated' } | { kind: 'too_long'; lengthMs: number } | { kind: 'incompatible'; clip: number; difference: string }
  | { kind: 'no_room' } | { kind: 'unavailable' } | { kind: 'stopped' };
/** Account and video come from trusted server context (an admitted native run), never from model arguments. */
export type JoinVideos = (accountId: string, videoId: string, clips: readonly string[], signal?: AbortSignal) => Promise<JoinOutcome>;
export type JoinCollaborators = Readonly<{
  reads: Pick<SavedWorkReads, 'workspace'>;
  readClip: (account: string, versionId: string) => Promise<StoredVideo>;
  join: (clips: readonly Uint8Array[], signal?: AbortSignal) => Promise<JoinedMedia>;
  save: (account: string, conversation: string, input: GeneratedVideoInput, options: Readonly<{ signal?: AbortSignal | undefined }>) => Promise<GeneratedVideoSave>;
  capacityWaitMs?: number; capacityRetryMs?: number;
}>;

/**
 * Joins saved clips, in order, into one new draft clip of the video, with the clips as its dependencies. The ids are
 * checked before any bytes are read; the originals and their uses are unchanged. Joining makes no paid call.
 */
export function createJoins(collaborators: JoinCollaborators): JoinVideos {
  const waitMs = collaborators.capacityWaitMs ?? 30_000, retryMs = collaborators.capacityRetryMs ?? 250;
  return async (accountId, videoId, clips, signal) => {
    try {
      if (clips.length < joinLimits.minClips || clips.length > joinLimits.maxClips) return { kind: 'invalid' };
      if (new Set(clips).size !== clips.length) return { kind: 'repeated' };
      const used = usedVideoVersions(await collaborators.reads.workspace(accountId, videoId));
      if (clips.some(id => !used.has(id))) return { kind: 'not_found' };
      const lengthMs = clips.reduce((sum, id) => sum + used.get(id)!, 0);
      if (lengthMs > joinLimits.maxLengthMs) return { kind: 'too_long', lengthMs };
      const bytes: Buffer[] = [];
      for (const id of clips) { signal?.throwIfAborted(); bytes.push((await collaborators.readClip(accountId, id)).bytes); }
      const joined = await whenFree(attempt => collaborators.join(bytes, attempt), { waitMs, retryMs, signal });
      if (joined.kind === 'incompatible') return { kind: 'incompatible', clip: joined.clip, difference: joined.difference };
      const { version } = await collaborators.save(accountId, videoId, { bytes: joined.bytes, frames: [], joined: { clips, frameMs: joined.lengthS * 1000 / joined.frames } }, { signal });
      return { kind: 'joined', versionId: version.id, width: version.media.width, height: version.media.height, durationMs: version.media.durationMs ?? 0, clips: clips.length };
    } catch (error) {
      if (signal?.aborted) return { kind: 'stopped' };
      if (error instanceof UseRoomError) return { kind: 'no_room' };
      if ((error instanceof UploadError || error instanceof ArtifactError) && error.code === 'not_found') return { kind: 'not_found' };
      logFailure('Video join failed', error);
      return { kind: 'unavailable' };
    }
  };
}
