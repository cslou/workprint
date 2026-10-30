import { applicationError, operations, type ErrorEnvelope, type OperationName, type OperationRequest, type OperationResponse } from '@workprint/contracts';
import { ArtifactError } from '../artifacts/index.js';
import type { Admission } from './admission.js';

type Authenticate = () => Promise<Admission>;

type ManualSave = (account: string, conversation: string, input: OperationRequest<'saveVersion'>['body']) => Promise<OperationResponse<'saveVersion'>>;
/** Only composition's human capability reaches this authenticated command boundary. */
export function withManualSaves<T extends { operations: Record<OperationName, (input: unknown, authenticate: Authenticate) => Promise<ErrorEnvelope | OperationResponse<OperationName>>> }>(base: T, save: ManualSave) {
  return { ...base, operations: { ...base.operations,
    saveVersion: async (input: unknown, authenticate: Authenticate): Promise<OperationResponse<'saveVersion'> | ErrorEnvelope> => {
      const admission = await authenticate();
      if (admission.kind === 'unauthorized') return applicationError('unauthenticated', 'Authentication required');
      if (admission.kind === 'unavailable') return applicationError('integration_failure', 'Authentication unavailable');
      const parsed = operations.saveVersion.request.safeParse(input);
      if (!parsed.success) return applicationError('invalid_input', 'Invalid application request');
      try {
        const result = await save(admission.accountId, parsed.data.params.id, parsed.data.body);
        if (!operations.saveVersion.response.safeParse(result).success) return applicationError('integration_failure', 'Saved work unavailable');
        return result;
      } catch (error) {
        if (error instanceof ArtifactError) return applicationError(error.code, error.message);
        return applicationError('integration_failure', 'Saved work unavailable');
      }
    },
  } };
}
export type ManualSaveApplication = ReturnType<typeof withManualSaves>;
