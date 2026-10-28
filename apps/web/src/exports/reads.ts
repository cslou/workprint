import { useMemo } from 'react';
import type { ApiClient } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import { useScopedRead, type ReadScope } from '../api/use-scoped-read.js';

export type ExportRecord = OperationResponse<'export'>;
export function useExports(client: ApiClient | null, scope: ReadScope | null) {
  const id = scope?.conversationId;
  const read = useMemo(() => client && id ? async (signal: AbortSignal) => {
    const items: ExportRecord[] = [], ids = new Set<string>(), cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const result = await client.exports({ params: { id }, query: cursor === undefined ? {} : { cursor }, body: {} }, { signal });
      if (!result.ok) return result;
      for (const item of result.value.items) {
        if (ids.has(item.id)) return { ok: false as const, error: { code: 'invalid_response' as const, message: 'Duplicate export' } };
        ids.add(item.id); items.push(item);
      }
      const next = result.value.nextCursor;
      if (next !== null && cursors.has(next)) return { ok: false as const, error: { code: 'invalid_response' as const, message: 'Repeated export cursor' } };
      if (next !== null) cursors.add(next);
      cursor = next ?? undefined;
    } while (cursor !== undefined && !signal.aborted);
    return { ok: true as const, value: items };
  } : null, [client, id]);
  return useScopedRead(scope, read);
}
export function useExport(client: ApiClient | null, scope: ReadScope | null, id: string) {
  const read = useMemo(() => client ? (signal: AbortSignal) => client.export({ params: { id }, query: {}, body: {} }, { signal }) : null, [client, id]);
  return useScopedRead(scope, read);
}
