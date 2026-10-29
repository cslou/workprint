import type { ApiClient, CallOptions, ClientResult } from '@workprint/api-client';
import { useBindingSchema, type OperationResponse } from '@workprint/contracts';

type Input = Readonly<{ conversationId: string; versionId: string; binding: OperationResponse<'useVersion'>['use']['binding']; minimumSelectionRevision?: number }>;

/** One command/validation path; consumers retain their own feedback and selection authority. */
export async function useVersion(client: ApiClient, { conversationId, versionId, binding, minimumSelectionRevision = 0 }: Input, options: CallOptions = {}): Promise<ClientResult<OperationResponse<'useVersion'>>> {
  const result = await client.useVersion({ params: { id: conversationId }, query: {}, body: { ...binding, operationId: crypto.randomUUID(), versionId } }, options);
  if (!result.ok) return result;
  const value = result.value;
  const expected = useBindingSchema.safeParse(binding);
  const observed = useBindingSchema.safeParse(value.use.binding);
  if (value.use.versionId !== versionId || value.use.state !== 'approved' || value.selectionRevision < minimumSelectionRevision || !expected.success || !observed.success || JSON.stringify(observed.data) !== JSON.stringify(expected.data)) {
    return { ok: false, error: { code: 'invalid_response', message: 'The approved use did not match the requested exact version and binding.' } };
  }
  return result;
}
