import { applicationError, operations, type ErrorEnvelope, type OperationName, type OperationRequest, type OperationResponse } from '@workprint/contracts';
import { ArtifactError } from '../artifacts/index.js';
import type { Admission } from './admission.js';

type Authenticate = () => Promise<Admission>;
type UseVersion = (account: string, conversation: string, input: OperationRequest<'useVersion'>['body']) => Promise<OperationResponse<'useVersion'>>;
/** Authenticated human exact-version use, including Panel-image and Shot-video choices. */
export function withVersionUses<T extends { operations: Record<OperationName, (input: unknown, authenticate: Authenticate) => Promise<ErrorEnvelope | OperationResponse<OperationName>>> }>(base: T, useVersion: UseVersion) {
  return { ...base, operations: { ...base.operations,
    useVersion: async (input: unknown, authenticate: Authenticate): Promise<OperationResponse<'useVersion'> | ErrorEnvelope> => {
      const admission = await authenticate();
      if (admission.kind === 'unauthorized') return applicationError('unauthenticated', 'Authentication required');
      if (admission.kind === 'unavailable') return applicationError('integration_failure', 'Authentication unavailable');
      const parsed = operations.useVersion.request.safeParse(input);
      if (!parsed.success) return applicationError('invalid_input', 'Invalid application request');
      try {
        const result = await useVersion(admission.accountId, parsed.data.params.id, parsed.data.body);
        if (!operations.useVersion.response.safeParse(result).success) return applicationError('integration_failure', 'Saved work unavailable');
        return result;
      } catch (error) {
        if (error instanceof ArtifactError) return applicationError(error.code, error.message);
        return applicationError('integration_failure', 'Saved work unavailable');
      }
    },
  } };
}
export type VersionUseApplication = ReturnType<typeof withVersionUses>;
