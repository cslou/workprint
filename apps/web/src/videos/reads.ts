import { useMemo } from 'react';
import type { ApiClient } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import { useScopedRead, type ReadScope } from '../api/use-scoped-read.js';
import { collectPages } from '../api/paged-read.js';
export type GenerationRequest = OperationResponse<'generationRequest'>;
export const unfinished = (request: GenerationRequest) => request.status === 'queued' || request.status === 'submitting' || request.status === 'running';
export const sameRequest = (a: GenerationRequest, b: GenerationRequest) => a.id === b.id && a.batchId === b.batchId && a.proposalId === b.proposalId && a.purpose === b.purpose && JSON.stringify(a.target) === JSON.stringify(b.target);
export function useGenerationRequests(client: ApiClient | null, scope: ReadScope | null) {
  const id = scope?.conversationId;
  const read = useMemo(() => client && id ? (signal: AbortSignal) => collectPages(
    (cursor, signal) => client.generationRequests({ params: { id }, query: cursor === undefined ? {} : { cursor }, body: {} }, { signal }),
    signal, { duplicate: 'Duplicate generation request', repeatedCursor: 'Repeated generation request cursor' },
  ) : null, [client, id]);
  return useScopedRead(scope, read);
}
export function useGenerationRequest(client: ApiClient | null, scope: ReadScope | null, id: string, open: boolean, onObserved?: (request: GenerationRequest) => void) {
  const read = useMemo(() => client && open ? async (signal: AbortSignal) => {
    const result = await client.generationRequest({ params: { id }, query: {}, body: {} }, { signal });
    if (result.ok && !signal.aborted) onObserved?.(result.value);
    return result;
  } : null, [client, id, open, onObserved]);
  return useScopedRead(scope, read);
}
