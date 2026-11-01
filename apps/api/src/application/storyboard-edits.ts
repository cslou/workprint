import { applicationError, operations, type ErrorEnvelope, type OperationName, type OperationRequest, type OperationResponse } from '@workprint/contracts';
import { ArtifactError } from '../artifacts/index.js';
import type { Admission } from './admission.js';

type Authenticate = () => Promise<Admission>;
type EditStoryboard = (account: string, conversation: string, input: OperationRequest<'editStoryboard'>['body']) => Promise<OperationResponse<'editStoryboard'>>;
/** Authenticated human planning edits of existing Shots/Panels only. */
export function withStoryboardEdits<T extends { operations: Record<OperationName, (input: unknown, authenticate: Authenticate) => Promise<ErrorEnvelope | OperationResponse<OperationName>>> }>(base: T, edit: EditStoryboard) {
  return { ...base, operations: { ...base.operations,
    editStoryboard: async (input: unknown, authenticate: Authenticate): Promise<OperationResponse<'editStoryboard'> | ErrorEnvelope> => {
      const admission = await authenticate();
      if (admission.kind === 'unauthorized') return applicationError('unauthenticated', 'Authentication required');
      if (admission.kind === 'unavailable') return applicationError('integration_failure', 'Authentication unavailable');
      const parsed = operations.editStoryboard.request.safeParse(input);
      if (!parsed.success) return applicationError('invalid_input', 'Invalid application request');
      try {
        const result = await edit(admission.accountId, parsed.data.params.id, parsed.data.body);
        if (!operations.editStoryboard.response.safeParse(result).success) return applicationError('integration_failure', 'Saved work unavailable');
        return result;
      } catch (error) {
        if (error instanceof ArtifactError) return applicationError(error.code, error.message);
        return applicationError('integration_failure', 'Saved work unavailable');
      }
    },
  } };
}
export type StoryboardEditApplication = ReturnType<typeof withStoryboardEdits>;
