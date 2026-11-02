import { applicationError, operations, type ErrorEnvelope, type OperationName, type OperationRequest, type OperationResponse } from '@workprint/contracts';
import { GenerationJobError, type GenerationJobs, type VideoJob } from '../generation/index.js';
import type { Admission } from './admission.js';

type Authenticate = () => Promise<Admission>;
type ReadName = 'generationRequests' | 'generationRequest';
export type GenerationJobReads = Pick<GenerationJobs, 'list' | 'get'>;
type OwnedConversation = (accountId: string, conversationId: string) => Promise<{ kind: 'owned' | 'not_found' | 'unavailable' }>;
/** Conversation ownership couldn't be checked: an integration failure, never a not-found. */
class OwnershipUnavailable extends Error { override readonly name = 'OwnershipUnavailable'; }

const pageSize = 50;

/** The browser's view of a saved job: its state and MiniMax task id, never the prompt or private rows. */
export function publicJob(job: VideoJob): OperationResponse<'generationRequest'> {
  return {
    id: job.id, purpose: 'video', status: job.status, revision: job.revision,
    ...(job.failureReason ? { failureReason: job.failureReason } : {}),
    ...(job.resultVersionId ? { resultVersionId: job.resultVersionId } : {}),
    remote: job.taskId ? { taskId: job.taskId } : {},
  };
}

function boundary<N extends ReadName>(name: N, read: (account: string, input: OperationRequest<N>) => Promise<OperationResponse<N>>) {
  return async (input: unknown, authenticate: Authenticate): Promise<OperationResponse<N> | ErrorEnvelope> => {
    const admission = await authenticate();
    if (admission.kind === 'unauthorized') return applicationError('unauthenticated', 'Authentication required');
    if (admission.kind === 'unavailable') return applicationError('integration_failure', 'Authentication unavailable');
    const parsed = operations[name].request.safeParse(input);
    if (!parsed.success) return applicationError('invalid_input', 'Invalid application request');
    try {
      const result = await read(admission.accountId, parsed.data as OperationRequest<N>);
      if (!operations[name].response.safeParse(result).success) return applicationError('integration_failure', 'Generation requests unavailable');
      return result;
    } catch (error) {
      if (error instanceof GenerationJobError && error.code !== 'stale') return applicationError(error.code, error.code === 'not_found' ? 'Not found' : 'Invalid application request');
      if (error instanceof OwnershipUnavailable) return applicationError('integration_failure', 'Conversation ownership unavailable');
      return applicationError('integration_failure', 'Generation requests unavailable');
    }
  };
}

/** Owned, bounded reads of a video's saved jobs. Cancelling stays unavailable (B-029). */
export function withGenerationRequests<T extends { operations: Record<OperationName, (input: unknown, authenticate: Authenticate) => Promise<ErrorEnvelope | OperationResponse<OperationName>>> }>(base: T, checkOwnedConversation: OwnedConversation, jobs: GenerationJobReads) {
  return { ...base, operations: { ...base.operations,
    generationRequests: boundary('generationRequests', async (account, input) => {
      const owned = await checkOwnedConversation(account, input.params.id);
      if (owned.kind === 'not_found') throw new GenerationJobError('not_found');
      if (owned.kind !== 'owned') throw new OwnershipUnavailable();
      const { status } = input.query;
      // Jobs are never queued or cancelled, so those filters match nothing.
      if (status === 'queued' || status === 'cancelled') return { items: [], nextCursor: null };
      const page = await jobs.list(account, input.params.id, { cursor: input.query.cursor, limit: input.query.limit ?? pageSize, status });
      return { items: page.jobs.map(publicJob), nextCursor: page.nextCursor };
    }),
    generationRequest: boundary('generationRequest', async (account, input) => publicJob(await jobs.get(account, input.params.id))),
  } };
}
export type GenerationRequestApplication = ReturnType<typeof withGenerationRequests>;
