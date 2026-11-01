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
      const parsed = operations.workspace.response.safeParse(workspace);
      if (parsed.success) return { kind: 'found', workspace };
      // Field paths only: never saved values or identities.
      console.error('Workspace read rejected by its contract', { paths: parsed.error.issues.slice(0, 5).map(issue => issue.path.join('.')) });
      return { kind: 'unavailable' };
    } catch (error) {
      if (error instanceof ArtifactError && error.code === 'not_found') return { kind: 'not_found' };
      console.error('Workspace read failed', { name: error instanceof Error ? error.name : 'unknown', ...(error instanceof ArtifactError ? { code: error.code } : {}) });
      return { kind: 'unavailable' };
    }
  };
}
