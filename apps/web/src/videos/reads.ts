import { useMemo } from 'react';
import type { ApiClient, ClientResult } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import { useScopedRead, type ReadScope } from '../api/use-scoped-read.js';
export type GenerationRequest = OperationResponse<'generationRequest'>;
export const unfinished = (request: GenerationRequest) => request.status === 'queued' || request.status === 'submitting' || request.status === 'running';
export const sameRequest = (a: GenerationRequest, b: GenerationRequest) => a.id === b.id && a.batchId === b.batchId && a.proposalId === b.proposalId && a.purpose === b.purpose && JSON.stringify(a.target) === JSON.stringify(b.target);
export function useGenerationRequests(client: ApiClient | null, scope: ReadScope | null) {
  const id = scope?.conversationId;
  const read = useMemo(() => client && id ? async (signal: AbortSignal): Promise<ClientResult<GenerationRequest[]>> => {
    const items: GenerationRequest[] = [], ids = new Set<string>(), cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const result = await client.generationRequests({ params: { id }, query: cursor === undefined ? {} : { cursor }, body: {} }, { signal });
      if (!result.ok) return result;
      for (const item of result.value.items) { if (ids.has(item.id)) return { ok: false, error: { code: 'invalid_response', message: 'Duplicate generation request' } }; ids.add(item.id); items.push(item); }
      const next = result.value.nextCursor;
      if (next !== null && cursors.has(next)) return { ok: false, error: { code: 'invalid_response', message: 'Repeated generation request cursor' } };
      if (next !== null) cursors.add(next);
      cursor = next ?? undefined;
    } while (cursor !== undefined && !signal.aborted);
    return { ok: true, value: items };
  } : null, [client, id]);
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
