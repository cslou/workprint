import { operations, type OperationResponse } from '@workprint/contracts';
import { ArtifactError } from '../artifacts/index.js';
import type { SavedWorkReads } from './saved-reads.js';

export type OwnedWorkspace = OperationResponse<'workspace'>;
/** A trusted read: `not_found` never says whether the video exists for someone else. */
export type OwnedWorkspaceRead = { kind: 'found'; workspace: OwnedWorkspace } | { kind: 'not_found' } | { kind: 'unavailable' };
/** Account and video come from trusted server context (an admitted native run), never from caller claims. */
export type ReadOwnedWorkspace = (accountId: string, videoId: string) => Promise<OwnedWorkspaceRead>;

/** The video's saved work for in-process callers such as agent tools, through the same owned reads. */
export function createWorkspaceReader(reads: Pick<SavedWorkReads, 'workspace'>): ReadOwnedWorkspace {
  return async (accountId, videoId) => {
    try {
      const workspace = await reads.workspace(accountId, videoId);
      return operations.workspace.response.safeParse(workspace).success ? { kind: 'found', workspace } : { kind: 'unavailable' };
    } catch (error) {
      return error instanceof ArtifactError && error.code === 'not_found' ? { kind: 'not_found' } : { kind: 'unavailable' };
    }
  };
}
