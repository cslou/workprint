import { applicationError, operations, type ErrorEnvelope, type OperationName, type OperationRequest, type OperationResponse } from '@workprint/contracts';
import { UploadError, type UploadCoordinator } from '../artifacts/index.js';
import type { Admission } from './admission.js';

type Authenticate = () => Promise<Admission>;
type Boundary = (input: unknown, authenticate: Authenticate) => Promise<ErrorEnvelope | OperationResponse<OperationName>>;
/** Only admitted identity and closed metadata reach the artifacts-owned upload service. */
export function withUploads<T extends { operations: Record<OperationName, Boundary> }>(base: T, uploads: UploadCoordinator) {
  const invoke = async <N extends 'requestUpload' | 'confirmUpload' | 'media'>(name: N, input: unknown, authenticate: Authenticate, work: (account: string, request: OperationRequest<N>) => Promise<OperationResponse<N>>): Promise<OperationResponse<N> | ErrorEnvelope> => {
    const admission = await authenticate();
    if (admission.kind === 'unauthorized') return applicationError('unauthenticated', 'Authentication required');
    if (admission.kind === 'unavailable') return applicationError('integration_failure', 'Authentication unavailable');
    const parsed = operations[name].request.safeParse(input);
    if (!parsed.success) return applicationError('invalid_input', 'Invalid application request');
    try {
      const result = await work(admission.accountId, parsed.data as OperationRequest<N>);
      if (!operations[name].response.safeParse(result).success) return applicationError('integration_failure', 'Upload unavailable');
      return result;
    } catch (error) { return error instanceof UploadError ? applicationError(error.code, error.message) : applicationError('integration_failure', 'Upload unavailable'); }
  };
  return { ...base, operations: { ...base.operations,
    media: (input: unknown, authenticate: Authenticate) => invoke('media', input, authenticate, (account, request) => uploads.media(account, request.params.id)),
    requestUpload: (input: unknown, authenticate: Authenticate) => invoke('requestUpload', input, authenticate, (account, request) => uploads.request(account, request.params.id, request.body)),
    confirmUpload: (input: unknown, authenticate: Authenticate) => invoke('confirmUpload', input, authenticate, (account, request) => uploads.confirm(account, request.params.id, request.body.operationId)),
  } };
}
export type UploadApplication = ReturnType<typeof withUploads>;
