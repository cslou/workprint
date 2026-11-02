import { z } from 'zod';
import { defineTool } from '../define.js';
import { listWorkspace, workspaceItem, type WorkspaceItemDetail, type WorkspaceListing } from '../../workspace-entries.js';

/** A video job that stopped waiting, as the model sees it: `jobId` is what generate-video's `resume` takes. */
type StoppedVideoItem = { jobId: string; frames: number; submittedAt: string };
type ReadWorkspaceResult =
  | ({ found: true; mode: 'listing'; stoppedVideos?: StoppedVideoItem[] } & WorkspaceListing)
  | { found: true; mode: 'item'; item: WorkspaceItemDetail }
  | { found: false; reason: 'not_found' | 'unavailable' };

/** Reads the video's saved work through the owned workspace read, for the run's own account and video. */
export const readWorkspaceTool = defineTool({
  id: 'read-workspace',
  description: [
    'Read the saved work in this video: the script, references and uploaded images, the storyboard and shot versions.',
    'Call it with no arguments for a compact list of every exact version, with its name, kind, versionId, use, state and short text.',
    'Pass a versionId from that list to read that one item in full.',
    'The list also gives stoppedVideos: videos that stopped waiting, newest first, each with the jobId to pass as generate-video resume when the user asks to continue one.',
  ].join(' '),
  inputSchema: z.strictObject({ versionId: z.string().min(1).max(200).optional().describe('An exact versionId from the listing, to read that item in full.') }),
  phrase: 'Getting up to date on our progress…',
  doneSummary: (result: ReadWorkspaceResult) => !result.found ? result.reason === 'not_found' ? 'Couldn’t find that item' : 'Couldn’t read the saved work'
    : result.mode === 'item' ? `Read ${result.item.name}`
    : result.total === 0 ? 'Nothing saved yet' : `Read ${result.total} saved item${result.total === 1 ? '' : 's'}`,
  execute: async (input, { scope, collaborators }): Promise<ReadWorkspaceResult> => {
    const read = await collaborators.readWorkspace(scope.accountId, scope.videoId);
    if (read.kind !== 'found') return { found: false, reason: read.kind };
    if (input.versionId === undefined) {
      // Stopped jobs are listed only when the server can make videos; a failed read of them leaves the list as it is.
      const stopped = await collaborators.videos?.stopped(scope.accountId, scope.videoId);
      const stoppedVideos = stopped?.kind === 'read' ? stopped.jobs.map(job => ({ jobId: job.jobId, frames: job.frames, submittedAt: job.submittedAt.toISOString() })) : [];
      const envelope = { found: true, mode: 'listing', ...(stoppedVideos.length ? { stoppedVideos } : {}) } as const;
      return { ...envelope, ...listWorkspace(read.workspace, envelope) };
    }
    const item = workspaceItem(read.workspace, input.versionId);
    // A foreign, missing or unused version looks the same: not found.
    return item ? { found: true, mode: 'item', item } : { found: false, reason: 'not_found' };
  },
});
