import { useMemo } from 'react';
import type { ApiClient } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import { useScopedRead, type ReadScope } from '../api/use-scoped-read.js';
import { collectPages } from '../api/paged-read.js';

export type ExportRecord = OperationResponse<'export'>;
export function useExports(client: ApiClient | null, scope: ReadScope | null) {
  const id = scope?.conversationId;
  const read = useMemo(() => client && id ? (signal: AbortSignal) => collectPages(
    (cursor, signal) => client.exports({ params: { id }, query: cursor === undefined ? {} : { cursor }, body: {} }, { signal }),
    signal, { duplicate: 'Duplicate export', repeatedCursor: 'Repeated export cursor' },
  ) : null, [client, id]);
  return useScopedRead(scope, read);
}
export function useExport(client: ApiClient | null, scope: ReadScope | null, id: string) {
  const read = useMemo(() => client ? (signal: AbortSignal) => client.export({ params: { id }, query: {}, body: {} }, { signal }) : null, [client, id]);
  return useScopedRead(scope, read);
}
