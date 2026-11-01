import { applicationError, operations, type ErrorEnvelope, type OperationName, type OperationRequest, type OperationResponse } from '@workprint/contracts';
import { ArtifactError } from '../artifacts/index.js';
import type { Admission } from './admission.js';

type Authenticate = () => Promise<Admission>;
type ReadName = 'workspace' | 'artifactVersions' | 'version' | 'library';
export type SavedWorkReads = {
  workspace(account: string, conversation: string): Promise<OperationResponse<'workspace'>>;
  history(account: string, artifact: string, query: OperationRequest<'artifactVersions'>['query']): Promise<OperationResponse<'artifactVersions'>>;
  version(account: string, version: string): Promise<OperationResponse<'version'>>;
  library(account: string, query: OperationRequest<'library'>['query']): Promise<OperationResponse<'library'>>;
};
function boundary<N extends ReadName>(name: N, read: (account: string, input: OperationRequest<N>) => Promise<OperationResponse<N>>) {
  return async (input: unknown, authenticate: Authenticate): Promise<OperationResponse<N> | ErrorEnvelope> => {
    const admission = await authenticate();
    if (admission.kind === 'unauthorized') return applicationError('unauthenticated', 'Authentication required');
    if (admission.kind === 'unavailable') return applicationError('integration_failure', 'Authentication unavailable');
    const parsed = operations[name].request.safeParse(input);
    if (!parsed.success) return applicationError('invalid_input', 'Invalid application request');
    try {
      const result = await read(admission.accountId, parsed.data as OperationRequest<N>);
      if (!operations[name].response.safeParse(result).success) return applicationError('integration_failure', 'Saved work unavailable');
      return result;
    } catch (error) {
      if (error instanceof ArtifactError) return applicationError(error.code, error.message);
      return applicationError('integration_failure', 'Saved work unavailable');
    }
  };
}
/** Add reads without mutating the shared unavailable map or enabling write operations. */
export function withSavedWork<T extends { operations: Record<OperationName, (input: unknown, authenticate: Authenticate) => Promise<ErrorEnvelope>> }>(base: T, reads: SavedWorkReads) {
  return { ...base, operations: { ...base.operations,
    workspace: boundary('workspace', (account, input) => reads.workspace(account, input.params.id)),
    artifactVersions: boundary('artifactVersions', (account, input) => reads.history(account, input.params.id, input.query)),
    version: boundary('version', (account, input) => reads.version(account, input.params.id)),
    library: boundary('library', (account, input) => reads.library(account, input.query)),
  } };
}
export type SavedWorkApplication = ReturnType<typeof withSavedWork>;
