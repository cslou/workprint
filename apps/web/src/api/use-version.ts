import { requestVersionUse, type ApiClient, type CallOptions, type ClientResult } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';

type Input = Readonly<{ conversationId: string; versionId: string; binding: OperationResponse<'useVersion'>['use']['binding']; minimumSelectionRevision?: number; operationId?: string }>;

/** One command/validation path; consumers retain their own feedback and selection authority. */
export async function useVersion(client: ApiClient, { conversationId, versionId, binding, minimumSelectionRevision = 0, operationId = crypto.randomUUID() }: Input, options: CallOptions = {}): Promise<ClientResult<OperationResponse<'useVersion'>>> {
  return requestVersionUse(client, { params: { id: conversationId }, query: {}, body: { ...binding, operationId, versionId } }, minimumSelectionRevision, options);
}
